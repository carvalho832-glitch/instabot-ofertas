// Story replies are user-initiated Instagram messages, not public comments.
// Fail closed: never use this route for story views, reactions, mentions, ordinary DMs,
// media shares or events without a story ID, message ID and explicit keyword.
export function normalizeReplyText(text){
 return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().trim().replace(/[!?.;,:\s]+$/gu,'').replace(/\s+/g,' ');
}
export function keywordMatched(text,keywords=[]){
 const normalized=normalizeReplyText(text);
 if(!normalized||normalized.length>80)return false;
 return keywords.some(k=>normalizeReplyText(k)===normalized);
}
export function extractStoryReplies(payload={}){
 if(payload.object!=='instagram')return [];
 const result=[];
 for(const entry of Array.isArray(payload.entry)?payload.entry:[]){
  // Meta Instagram Login sends message events in entry[].messaging.
  const messages=Array.isArray(entry.messaging)?entry.messaging:[];
  for(const event of messages){
   const message=event?.message||{};
   const story=message?.reply_to?.story;
   const mid=message.mid;
   const senderId=String(event.sender?.id||'');
   const recipientId=String(event.recipient?.id||'');
   const storyId=String(story?.id||'');
   if(message.is_echo||!story||!message.text||!mid)continue;
   if(!/^\d{10,25}$/.test(storyId)||!/^\d{10,25}$/.test(senderId)||!/^\d{10,25}$/.test(recipientId))continue;
   const messageId=String(mid);
   if(messageId.length<5||messageId.length>255)continue;
   const sentAt=Number(event.timestamp);
   if(!Number.isFinite(sentAt)||sentAt<=0)continue;
   result.push({messageId,storyId,senderId,recipientId,text:String(message.text).slice(0,200),
    sentAt,source:'story_reply'});
  }
 }
 return result;
}
export function recentUserInitiatedReply(reply,now=Date.now()){
 const age=now-Number(reply.sentAt);
 return Number.isFinite(age)&&age>=-5*60000&&age<23*60*60*1000;
}
export async function handleStoryReply(reply,{
 supabase,enabled=false,allowLive=false,ownerId,sendDirect,renderMessage,
 now=Date.now()
}={}){
 if(!recentUserInitiatedReply(reply,now))return {status:'expired_or_invalid'};
 if(!enabled||!allowLive)return {status:'disabled'};
 if(!/^\d{10,25}$/.test(String(ownerId||''))||String(ownerId)!==String(reply.recipientId))
  return {status:'wrong_account'};
 const {data:rows,error:lookupError}=await supabase.from('produtos').select('*')
   .eq('instagram_media_id',reply.storyId).eq('ativo',true).limit(2);
 if(lookupError)throw lookupError;
 if(!rows?.length||rows.length!==1)return {status:'not_registered'};
 const product=rows[0];
 if(!keywordMatched(reply.text,product.palavras_chave||[]))return {status:'keyword_mismatch'};
 if(!product.link_afiliado||!product.nome)return {status:'invalid_product'};
 // Unique key on Instagram message ID provides an atomic reservation before sending.
 // We deliberately DO NOT automatically retry an ambiguous response to avoid double DMs.
 const reservation={instagram_message_id:reply.messageId,instagram_media_id:reply.storyId,
  instagram_sender_id:reply.senderId,produto_id:product.id,status:'sending'};
 const {error:reserveError}=await supabase.from('story_reply_dispatches').insert(reservation);
 if(reserveError){
  if(String(reserveError.code)==='23505')return {status:'duplicate'};
  throw reserveError;
 }
 try{
  const text=renderMessage(product,reply);
  if(!text||text.length>2000)throw new Error('invalid_message');
  const sent=await sendDirect({recipientId:reply.senderId,recipientIdOfBusiness:reply.recipientId,text});
  if(!sent?.message_id)throw new Error('meta_message_id_missing');
  const {error:updateError}=await supabase.from('story_reply_dispatches')
   .update({status:'sent',meta_message_id:String(sent.message_id).slice(0,255),updated_at:new Date().toISOString()})
   .eq('instagram_message_id',reply.messageId).eq('status','sending');
  if(updateError)throw updateError;
  return {status:'sent',storyId:reply.storyId};
 }catch(e){
  // Send result could be ambiguous; leave a reviewable record, never resend on webhook replay.
  await supabase.from('story_reply_dispatches').update({
   status:'needs_review',error_code:String(e?.message||'send_failure').slice(0,100),
   updated_at:new Date().toISOString()
  }).eq('instagram_message_id',reply.messageId).eq('status','sending');
  return {status:'needs_review'};
 }
}
