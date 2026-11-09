import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  normalizeCatalogKeyword, extractCatalogIncoming, eligibleCatalogInbound,
  validPdf, createInstagramCatalogs
} from "../instagram-catalogos.mjs";

function mockStorage() {
  const files = new Map();
  let bucket = false;
  const from = () => ({
    list: async prefix => bucket
      ? {data:[...files.keys()].filter(k=>k.startsWith(prefix+"/"))
        .map(k=>({name:k.slice(prefix.length+1)})),error:null}
      : {data:null,error:{statusCode:"404"}},
    upload: async (path,bytes,opts={}) => {
      if (files.has(path) && !opts.upsert) return {error:{statusCode:"409"}};
      files.set(path, Buffer.from(bytes));
      return {data:{path},error:null};
    },
    update: async (path,bytes) => {
      if (!files.has(path)) return {error:{statusCode:"404"}};
      files.set(path,Buffer.from(bytes));
      return {data:{path},error:null};
    },
    download: async path => files.has(path)
      ? {data:new Blob([files.get(path)]),error:null}
      : {error:{statusCode:"404"}},
    createSignedUrl: async path => files.has(path)
      ? {data:{signedUrl:"https://storage.example.com/object/file.pdf?token=abc"},error:null}
      : {data:null,error:{statusCode:"404"}},
    remove: async paths => {for (const p of paths) files.delete(p);return {error:null}}
  });
  return {
    files,
    supabase:{storage:{
      getBucket:async()=>bucket?{data:{name:"instabot-catalogos"},error:null}:{data:null,error:{statusCode:"404"}},
      createBucket:async()=>{bucket=true;return {error:null}},
      from
    }}
  };
}

async function apiTest() {
  const source=mockStorage();
  const sends=[];
  const catalog=createInstagramCatalogs({
    supabase:source.supabase,
    getLiveContext:async ({checkIdentity})=>({ownerId:checkIdentity?"1234567890123":"configured",accessToken:"mock-token"}),
    sendPdf:async payload=>{sends.push({type:"pdf",...payload});return {message_id:"pdfid"}},
    sendText:async payload=>{sends.push({type:"text",...payload});return {message_id:"textid"}},
    sendCommentReply:async payload=>{sends.push({type:"comment",...payload});return {message_id:"replyid"}},
    logger:{warn:()=>{}}
  });
  const app=express();
  app.use("/api/catalogos",catalog.router);
  const listener=app.listen(0,"127.0.0.1");
  await new Promise(resolve=>listener.once("listening",resolve));
  return {
    catalog,sends,source,
    url:"http://127.0.0.1:"+listener.address().port,
    close:()=>new Promise(resolve=>listener.close(resolve))
  };
}

test("keyword, PDF e webhook estritos",()=>{
  assert.equal(normalizeCatalogKeyword("  Eu quero CATÁLOGO  "),"EU QUERO CATALOGO");
  assert.equal(normalizeCatalogKeyword("eu quero perfume"),"EU QUERO PERFUME");
  const pdf=Buffer.concat([Buffer.from("%PDF-1.4\n"),Buffer.alloc(1400),Buffer.from("\n%%EOF\n")]);
  assert.equal(validPdf(pdf),true);
  assert.equal(validPdf(Buffer.from("ZIP")),false);
  const now=Date.now();
  const event={object:"instagram",entry:[{messaging:[
    {sender:{id:"9876543210987"},recipient:{id:"1234567890123"},timestamp:now,
      message:{mid:"a1b2c3d4e5",text:"Eu quero catálogo",reply_to:{story:{id:"1098765432109"}}}},
    {sender:{id:"9876543210987"},recipient:{id:"1234567890123"},timestamp:now,
      message:{mid:"echo",text:"Eu quero catálogo",is_echo:true}}
  ]}]};
  const incoming=extractCatalogIncoming(event);
  assert.equal(incoming.length,1);
  assert.equal(incoming[0].storyId,"1098765432109");
  assert.equal(eligibleCatalogInbound(incoming[0]),true);
  assert.equal(eligibleCatalogInbound({...incoming[0],sentAt:now-25*3600000}),false);
});

test("cadastra privado, ativa, envia PDF uma vez e responde ao comentario",async t=>{
  const env=await apiTest();
  t.after(()=>env.close());
  const pdf=Buffer.concat([Buffer.from("%PDF-1.4\n"),Buffer.alloc(1400),Buffer.from("\n%%EOF\n")]);
  const list1=await fetch(env.url+"/api/catalogos").then(x=>x.json());
  assert.deepEqual(list1.catalogs,[]);
  const query=new URLSearchParams({name:"Melhores Perfumes Árabes",keyword:"EU QUERO CATÁLOGO"});
  const upload=await fetch(env.url+"/api/catalogos/upload?"+query,{method:"POST",
    headers:{"Content-Type":"application/pdf"},body:pdf});
  assert.equal(upload.status,201);
  const created=await upload.json();
  assert.equal(created.catalog.active,false);
  assert.equal(created.catalog.size,pdf.length);
  assert.ok(!created.catalog.pdfPath);
  const item={mid:"mid_abcdefghi",senderId:"9876543210987",
    recipientId:"1234567890123",text:"eu quero catálogo",sentAt:Date.now(),storyId:""};
  assert.equal((await env.catalog.handleIncoming(item)).matched,false);
  const enabled=await fetch(env.url+"/api/catalogos/"+created.catalog.id,{
    method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:true})});
  assert.equal(enabled.status,200);
  assert.equal((await env.catalog.handleIncoming(item)).status,"sent");
  assert.equal(env.sends.length,2);
  assert.equal(env.sends[0].type,"pdf");
  assert.ok(env.sends[0].url.startsWith("https:"));
  assert.equal(env.sends[1].type,"text");
  assert.match(env.sends[1].message,/a venda e a entrega são responsabilidade/i);
  assert.equal((await env.catalog.handleIncoming(item)).status,"duplicate");
  assert.equal(env.sends.length,2);
  assert.equal((await env.catalog.handleIncoming({...item,mid:"new_mid",text:"EU QUERO PERFUME"})).matched,false);
  const comment=await env.catalog.handleComment({commentId:"1234567890999",
    postId:"1098765432109",comment:"EU QUERO CATÁLOGO"});
  assert.equal(comment.status,"private_invitation_sent");
  assert.equal(env.sends[2].type,"comment");
  assert.equal((await env.catalog.handleComment({commentId:"1234567890999",
    postId:"1098765432109",comment:"EU QUERO CATÁLOGO"})).status,"duplicate");
});
