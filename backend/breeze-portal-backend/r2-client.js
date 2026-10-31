// r2-client.js - Cloudflare R2 (S3-kompatibel) lagerklient
// Nøgler læses KUN fra miljøvariabler (Render). Aldrig i koden eller git.
// Aktivér med miljøvariablen USE_R2=true - uden den sker intet.
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ENDPOINT = (process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')).trim();
const R2_BUCKET = (process.env.R2_BUCKET || '').trim();
const USE_R2 = (process.env.USE_R2 || '').toLowerCase() === 'true';

// R2 er kun aktiv hvis flaget er slået til OG alle nøgler findes
export function r2Enabled() {
  return USE_R2 && !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT && R2_BUCKET);
}

let _client = null;
function getClient() {
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
    });
    console.log(`☁️  R2-klient oprettet (bucket: ${R2_BUCKET})`);
  }
  return _client;
}

// Upload en buffer til R2. Returnerer nøglen.
export async function r2Put(buffer, key, contentType) {
  await getClient().send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream'
  }));
  return key;
}

// Hent et objekt som en Node-læsestrøm (kan pipes direkte til res)
export async function r2GetStream(key) {
  const result = await getClient().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  return result.Body;
}

// Tjek om et objekt findes i R2
export async function r2Head(key) {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// Pipe en R2-strøm til et Express-svar
export function pipeR2ToRes(body, res) {
  return new Promise((resolve, reject) => {
    const stream = Readable.fromWeb(body.transformToWebStream());
    stream.on('end', resolve);
    stream.on('error', reject);
    stream.pipe(res);
  });
}
