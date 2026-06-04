import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import { formatDebugUrl, requireDebugScript } from './debug-guard.mjs';

requireDebugScript({ name: 'debug-cloudinary-download', requiredEnv: ['CLOUDINARY_DEBUG_PUBLIC_ID'] });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const publicId = process.env.CLOUDINARY_DEBUG_PUBLIC_ID;
const backupAssetId = process.env.CLOUDINARY_DEBUG_BACKUP_ASSET_ID;

let resourceMetadata = null;

// Method 1: Standard private_download_url with type authenticated
try {
  const url1 = cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    type: 'authenticated',
    expires_at: Math.floor(Date.now()/1000) + 3600
  });
  console.log('Method 1 (private_download_url authenticated):', formatDebugUrl(url1));
  const r1 = await fetch(url1);
  console.log('  Status:', r1.status, r1.statusText);
  if (r1.ok) {
    const buf = await r1.arrayBuffer();
    console.log('  Size:', buf.byteLength, 'bytes');
  } else {
    console.log('  Body:', (await r1.text()).substring(0, 200));
  }
} catch(e) { console.log('  Error:', e.message); }

// Method 2: Use type 'upload'
try {
  const url2 = cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    type: 'upload',
    expires_at: Math.floor(Date.now()/1000) + 3600
  });
  console.log('\nMethod 2 (private_download_url upload):', formatDebugUrl(url2));
  const r2 = await fetch(url2);
  console.log('  Status:', r2.status, r2.statusText);
  if (r2.ok) {
    const buf = await r2.arrayBuffer();
    console.log('  Size:', buf.byteLength, 'bytes');
  }
} catch(e) { console.log('  Error:', e.message); }

// Method 3: Use cloudinary.utils.api_sign_request to create a download token
try {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: publicId,
    timestamp,
    type: 'authenticated',
    resource_type: 'raw'
  };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
  const url3 = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/resources/raw/authenticated/${encodeURIComponent(publicId)}?timestamp=${timestamp}&signature=${signature}&api_key=${process.env.CLOUDINARY_API_KEY}`;
  console.log('\nMethod 3 (admin api):', formatDebugUrl(url3));
  const r3 = await fetch(url3);
  console.log('  Status:', r3.status, r3.statusText);
  if (r3.ok) {
    const json = await r3.json();
    console.log('  secure_url:', formatDebugUrl(json.secure_url));
  }
} catch(e) { console.log('Method 3 error:', e.message); }

// Method 4: Cloudinary Admin API download_backedup_asset
try {
  // This just fetches metadata via admin API, then tries to download
  const result = await cloudinary.api.resource(publicId, { resource_type: 'raw', type: 'authenticated' });
  resourceMetadata = result;
  console.log('\nMethod 4 (admin metadata):');
  console.log('  secure_url:', formatDebugUrl(result.secure_url));

  // Try fetching the secure_url
  const r4 = await fetch(result.secure_url);
  console.log('  fetch secure_url:', r4.status);

  // Try adding Cookie approach - nah, that won't work from server
  // Instead, use the Cloudinary download API
  const downloadUrl = cloudinary.utils.download_zip_url({
    public_ids: [publicId],
    resource_type: 'raw',
    type: 'authenticated',
    flatten_folders: true
  });
  console.log('  download_zip_url:', formatDebugUrl(downloadUrl));
  const r4b = await fetch(downloadUrl);
  console.log('  fetch zip:', r4b.status, r4b.statusText);
  if (r4b.ok) {
    const buf = await r4b.arrayBuffer();
    console.log('  ZIP Size:', buf.byteLength, 'bytes');
  }
} catch(e) { console.log('Method 4 error:', e.message); }

// Method 5: Use download_folder or download_backedup_asset
try {
  const assetId = resourceMetadata?.asset_id || backupAssetId;
  if (!assetId) {
    throw new Error('No asset id found. Set CLOUDINARY_DEBUG_BACKUP_ASSET_ID to test backup downloads.');
  }

  const downloadUrl = cloudinary.utils.download_backedup_asset(
    assetId,
    resourceMetadata?.version_id || ''
  );
  console.log('\nMethod 5 (download_backedup_asset):', formatDebugUrl(downloadUrl));
} catch(e) { console.log('Method 5:', e.message); }
