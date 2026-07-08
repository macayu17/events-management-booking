import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Check if Cloudinary is configured
 */
export const isCloudinaryConfigured = () => {
    return !!(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
};

/**
 * Upload an image buffer to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} folder - The folder to upload to (e.g., 'posters', 'tickets')
 * @returns {Promise<string>} - The secure URL of the uploaded image
 */
export const uploadToCloudinary = (fileBuffer, folder = 'posters') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `occasio/${folder}`,
                resource_type: 'image',
                transformation: [
                    { quality: 'auto:good' },
                    { fetch_format: 'auto' }
                ]
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result.secure_url);
                }
            }
        );

        uploadStream.end(fileBuffer);
    });
};

/**
 * Upload a PDF buffer to Cloudinary (using raw resource type with signed URL)
 * @param {Buffer} pdfBuffer - The PDF buffer to upload
 * @param {string} folder - The folder to upload to
 * @returns {Promise<string>} - The signed URL of the uploaded PDF (valid for 1 year)
 */
export const uploadPdfToCloudinary = (pdfBuffer, folder = 'tickets') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `occasio/${folder}`,
                resource_type: 'raw',  // Important for PDFs!
                format: 'pdf',
                type: 'authenticated'  // Use authenticated for signed URL access
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    // Generate a signed URL that's valid for 1 year (bypasses untrusted customer restriction)
                    const signedUrl = cloudinary.url(result.public_id, {
                        resource_type: 'raw',
                        type: 'authenticated',
                        sign_url: true,
                        expires_at: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year
                    });
                    resolve(signedUrl);
                }
            }
        );

        uploadStream.end(pdfBuffer);
    });
};

/**
 * Upload a PDF buffer to Cloudinary for certificate templates.
 * Uses authenticated type + signed URL to bypass Cloudinary's raw file delivery restrictions.
 * @param {Buffer} pdfBuffer - The PDF buffer to upload
 * @param {string} folder - The folder to upload to
 * @returns {Promise<string>} - A signed URL of the uploaded PDF (valid for 2 years)
 */
export const uploadPublicPdfToCloudinary = (pdfBuffer, folder = 'certificates') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `occasio/${folder}`,
                resource_type: 'raw',
                format: 'pdf',
                type: 'authenticated',
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    // Generate a long-lived signed URL
                    const signedUrl = cloudinary.url(result.public_id, {
                        resource_type: 'raw',
                        type: 'authenticated',
                        sign_url: true,
                        expires_at: Math.floor(Date.now() / 1000) + (2 * 365 * 24 * 60 * 60)
                    });
                    resolve(signedUrl);
                }
            }
        );

        uploadStream.end(pdfBuffer);
    });
};

export const uploadRawToCloudinary = (fileBuffer, folder = 'certificates', format) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `occasio/${folder}`,
                resource_type: 'raw',
                ...(format ? { format } : {}),
                type: 'authenticated',
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    const signedUrl = cloudinary.url(result.public_id, {
                        resource_type: 'raw',
                        type: 'authenticated',
                        sign_url: true,
                        expires_at: Math.floor(Date.now() / 1000) + (2 * 365 * 24 * 60 * 60)
                    });
                    resolve(signedUrl);
                }
            }
        );

        uploadStream.end(fileBuffer);
    });
};

/**
/**
 * Extract the public_id and delivery type from a Cloudinary raw URL.
 * @param {string} url - Any Cloudinary raw URL
 * @returns {{ publicId: string, type: string } | null}
 */
export const parseCloudinaryRawUrl = (url) => {
    if (!url || !isCloudinaryConfigured()) return null;

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!url.includes(`res.cloudinary.com/${cloudName}`)) return null;

    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');

        const rawIdx = pathParts.indexOf('raw');
        if (rawIdx === -1) return null;

        // After 'raw': type (upload|authenticated), optional s--xxx--, v123456, then public_id parts
        const type = pathParts[rawIdx + 1] || 'authenticated';
        let startIdx = rawIdx + 2;

        // Skip signature segment (s--xxxx--)
        if (pathParts[startIdx] && pathParts[startIdx].startsWith('s--')) startIdx++;

        // Skip version segment (v123456...)
        if (pathParts[startIdx] && /^v\d+/.test(pathParts[startIdx])) startIdx++;

        const publicId = pathParts.slice(startIdx).join('/');
        if (!publicId) return null;

        return { publicId, type };
    } catch {
        return null;
    }
};

/**
 * Given a Cloudinary raw URL (signed or unsigned), produce a fresh download URL
 * that uses the Cloudinary API (works even when CDN signed URLs return 401).
 * @param {string} url - Any Cloudinary raw URL
 * @returns {string|null} - Fresh download URL or null if not a Cloudinary URL
 */
export const signCloudinaryRawUrl = (url) => {
    const parsed = parseCloudinaryRawUrl(url);
    if (!parsed) return null;

    try {
        return cloudinary.utils.private_download_url(parsed.publicId, '', {
            resource_type: 'raw',
            type: parsed.type,
            expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour
        });
    } catch (e) {
        console.error('Failed to create Cloudinary download URL:', e.message);
        return null;
    }
};

/**
 * Download raw bytes from Cloudinary for an authenticated resource.
 * Uses private_download_url API which bypasses CDN auth issues.
 * @param {string} url - Any Cloudinary raw URL
 * @returns {Promise<Buffer|null>} - Buffer of the file contents, or null on failure
 */
export const downloadCloudinaryBuffer = async (url) => {
    const downloadUrl = signCloudinaryRawUrl(url);
    if (!downloadUrl) return null;

    try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            console.error('Cloudinary download failed:', response.status, response.statusText);
            return null;
        }
        return Buffer.from(await response.arrayBuffer());
    } catch (e) {
        console.error('Cloudinary download error:', e.message);
        return null;
    }
};

/**
 * Delete an image from Cloudinary by URL
 * @param {string} imageUrl - The Cloudinary URL of the image
 */
export const deleteFromCloudinary = async (imageUrl) => {
    try {
        // Extract public_id from URL
        const urlParts = imageUrl.split('/');
        const publicIdWithExtension = urlParts.slice(-2).join('/').split('.')[0];
        const publicId = `occasio/${publicIdWithExtension}`;

        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error('Failed to delete from Cloudinary:', error);
    }
};

export default cloudinary;
