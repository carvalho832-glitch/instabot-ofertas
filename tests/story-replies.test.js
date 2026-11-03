import test from 'node:test';
import assert from 'node:assert/strict';
import {extractStoryReplies,keywordMatched,recentUserInitiatedReply,handleStoryReply} from '../story-replies.js';
const now=Date.now();
const owner='17841442779350383',sender='17841400000000001',storyId='18123456789012345';
const messageId='m_STORY_REPLY_001';
const event={object:'instagram',entry:[{id:owner,time:now,messaging:[{
 sender:{id:sender},recipient:{id:owner},timestamp:now-3000,
 message:{mid:messageId,text:'EU QUERO!',reply_to:{story:{id:storyId,url:'https://instagram.test/story'}}}
}]}]};
const reply=extractStoryReplies(event)[0];
const product={id:'c1ca8f03-d26e-4f90-a70b-86af88a31589',nome:'Conjunto de camisetas',link_afiliado:'https://meli.la/test',palavras_chave:['eu quero'],ativo:true};
function db({rows=[product],duplicate=false}={}){
 const calls=[];let reservations=new Set(),updates=[];
 return {
  calls,reservations,updates,
  from(table){
   if(table==='produtos'){
    const query={
     select(){return query},eq(key,val){calls.push(['eq',key,val]);return query},
     async limit(){return {data:rows,error:null}}
    };return query;
   }
   if(table==='story_reply_dispatches')return{
    async insert(payload){calls.push(['insert',payload]);if(duplicate||reservations.has(payload.instagram_message_id))
      return {error:{code:'23505'}};reservations.add(payload.instagram_message_id);return {error:null}},
    update(data){calls.push(['update',data]);const query={eq(){return query},then(fn){fn({error:null});return Promise.resolve({error:null})}};
      updates.push(data);return query;}
   };
   throw Error('unexpected table');
  }
 };
}
test('extrai só resposta de Story, com ID correto e metadados',()=>{
 assert.equal(reply.storyId,storyId);
 assert.equal(reply.senderId,sender);
 assert.equal(reply.recipientId,owner);
 assert.equal(reply.messageId,messageId);
 assert.equal(extractStoryReplies({object:'page',entry:event.entry}).length,0);
});
test('ignora visualização, eco, DM normal, reação sem texto, ID ausente',()=>{
 const clone=JSON.parse(JSON.stringify(event));
 clone.entry[0].messaging.push(
  {message:{mid:'normal',text:'EU QUERO'},sender:{id:sender},recipient:{id:owner},timestamp:now},
  {message:{mid:'echo1',text:'EU QUERO',is_echo:true,reply_to:{story:{id:storyId}}},sender:{id:sender},recipient:{id:owner},timestamp:now},
  {message:{mid:'reaction',reply_to:{story:{id:storyId}}},sender:{id:sender},recipient:{id:owner},timestamp:now},
  {message:{mid:'reply_no_id',text:'eu quero',reply_to:{story:{url:'https://example.com/a'}}},sender:{id:sender},recipient:{id:owner},timestamp:now}
 );
 assert.equal(extractStoryReplies(clone).length,1);
});
test('aceita palavra-chave exata, ignora menções indevidas',()=>{
 assert.equal(keywordMatched(' EU QUERO!! ',['eu quero']),true);
 assert.equal(keywordMatched('oi, eu quero', ['eu quero']),false);
 assert.equal(keywordMatched('eu quero saber como funciona', ['eu quero']),false);
 assert.equal(keywordMatched('', ['eu quero']),false);
});
test('não envia quando está desativado ou usuário não iniciou recentemente',async()=>{
 let sent=false;
 const sut=await handleStoryReply(reply,{supabase:db(),enabled:false,allowLive:true,ownerId:owner,sendDirect:()=>{sent=true}});
 assert.equal(sut.status,'disabled');assert.equal(sent,false);
 assert.equal(recentUserInitiatedReply({...reply,sentAt:now-25*60*60*1000},now),false);
});
test('não envia para conta receptora errada, produto não cadastrado, palavra-chave inválida',async()=>{
 const send=()=>{throw Error('should not send')};
 assert.equal((await handleStoryReply(reply,{supabase:db(),enabled:true,allowLive:true,ownerId:sender,sendDirect:send,now})).status,'wrong_account');
 assert.equal((await handleStoryReply(reply,{supabase:db({rows:[]}),enabled:true,allowLive:true,ownerId:owner,sendDirect:send,now})).status,'not_registered');
 assert.equal((await handleStoryReply({...reply,text:'bom dia'},{supabase:db(),enabled:true,allowLive:true,ownerId:owner,sendDirect:send,now})).status,'keyword_mismatch');
});
test('reserva ID antes de enviar e registra sucesso uma vez',async()=>{
 const testDB=db();let sent=0;
 const opts={supabase:testDB,enabled:true,allowLive:true,ownerId:owner,now,
  renderMessage:()=> 'Olá! Aqui está o seu link de afiliado',
  sendDirect:async({recipientId,text})=>{sent++;assert.equal(recipientId,sender);assert.match(text,/link/);return {message_id:'m_return_1'}}};
 const first=await handleStoryReply(reply,opts);
 assert.equal(first.status,'sent');assert.equal(sent,1);
 assert.deepEqual(testDB.calls.find(x=>x[0]==='insert')[1].instagram_media_id,storyId);
 assert.equal(testDB.updates[0].status,'sent');
 const second=await handleStoryReply(reply,opts);
 assert.equal(second.status,'duplicate');assert.equal(sent,1);
});
test('falha de Meta não reenvia na repetição do webhook',async()=>{
 const testDB=db();let sent=0;
 const opts={supabase:testDB,enabled:true,allowLive:true,ownerId:owner,now,
  renderMessage:()=> 'Resposta ao Story, link de afiliado',
  sendDirect:async()=>{sent++;throw Error('timeout')}}
 assert.equal((await handleStoryReply(reply,opts)).status,'needs_review');
 assert.equal((await handleStoryReply(reply,opts)).status,'duplicate');
 assert.equal(sent,1);
});
