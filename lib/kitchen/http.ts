import { ApiError } from './errors.ts';
import type { Env } from './types.ts';
export const MAX_BODY_BYTES=128*1024;
export function json(value:unknown,status=200,headers:HeadersInit={}):Response {
  return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}});
}
export function etag(kind:string,id:string,revision:number):string {return `"${kind}:${id}:${revision}"`;}
export function checkRevision(request:Request,kind:string,id:string,revision:number):void {
  const expected=request.headers.get('If-Match');
  if(!expected) throw new ApiError(428,'PRECONDITION_REQUIRED','Send the ETag from the latest GET in an If-Match header.');
  if(expected!==etag(kind,id,revision)) throw new ApiError(412,'REVISION_CONFLICT','This record changed. Fetch it again and reconcile your edit.');
}
export async function body(request:Request):Promise<unknown> {
  if(request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')
    throw new ApiError(415,'UNSUPPORTED_MEDIA_TYPE','Send Content-Type: application/json.');
  const reader=request.body?.getReader();
  if(!reader) throw new ApiError(400,'INVALID_JSON','A JSON request body is required.');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
    if(length>MAX_BODY_BYTES){await reader.cancel();throw new ApiError(413,'BODY_TOO_LARGE',`Body limit is ${MAX_BODY_BYTES} bytes.`);}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw new ApiError(400,'INVALID_JSON','The request body must contain valid UTF-8 JSON.');}
}
export async function authenticate(request:Request,env:Env):Promise<void>{
  const configured=env.API_TOKEN;
  if(!configured || configured.length<32 || configured.length>256 || /REPLACE|CHANGE_ME/.test(configured))
    throw new ApiError(503,'AUTH_NOT_CONFIGURED','Set a random API_TOKEN secret before using this API.');
  const authorization=request.headers.get('Authorization')||'';
  const match=/^Bearer ([^\s]{32,256})$/i.exec(authorization);
  if(!match)throw new ApiError(401,'UNAUTHORIZED','A valid Bearer token is required.');
  // Compare fixed-size digests without an early exit. Never log either token.
  const enc=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(configured)),crypto.subtle.digest('SHA-256',enc.encode(match[1]!))]);
  const aa=new Uint8Array(a),bb=new Uint8Array(b);let difference=0;
  for(let i=0;i<aa.length;i++)difference|=aa[i]!^bb[i]!;
  if(difference!==0)throw new ApiError(401,'UNAUTHORIZED','A valid Bearer token is required.');
}
export function allowedOrigin(request:Request,env:Env):string|null{
  const incoming=request.headers.get('Origin');if(incoming===null)return null;
  const allowed=env.ALLOWED_ORIGIN||new URL(request.url).origin;
  // file:// origins, wildcard origins and opaque origins are deliberately not accepted.
  if(incoming==='null'||allowed==='*'||incoming!==allowed)throw new ApiError(403,'ORIGIN_NOT_ALLOWED','This browser origin is not allowed.');
  try{const u=new URL(allowed);if(u.origin!==allowed||!['http:','https:'].includes(u.protocol))throw new Error();}
  catch{throw new ApiError(503,'ORIGIN_NOT_CONFIGURED','Configure ALLOWED_ORIGIN as one exact HTTP(S) origin without a path.');}
  return incoming;
}
export function finalize(response:Response,requestId:string,origin:string|null):Response{
  const h=new Headers(response.headers);
  h.set('Cache-Control','no-store');h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','no-referrer');
  h.set('X-Request-Id',requestId);h.set('Vary','Origin');
  if(response.status===401)h.set('WWW-Authenticate','Bearer');
  if(origin){h.set('Access-Control-Allow-Origin',origin);h.set('Access-Control-Expose-Headers','ETag, X-Request-Id');}
  return new Response(response.body,{status:response.status,headers:h});
}
