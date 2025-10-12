// google-drive.js - Google Drive integration
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Google Drive API
let drive;

export function initGoogleDrive() {
  try {
    const credentialsPath = path.join(__dirname, 'google-credentials.json');
    
    if (!fs.existsSync(credentialsPath)) {
      console.error('❌ google-credentials.json not found!');
      return false;
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    drive = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive API initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Google Drive:', error.message);
    return false;
  }
}

// Upload file to Google Drive
export async function uploadToGoogleDrive(filePath, originalName, mimeType) {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    if (!folderId) {
      throw new Error('GOOGLE_DRIVE_FOLDER_ID not set in .env');
    }

    const fileMetadata = {
      name: originalName,
      parents: [folderId]
    };

    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(filePath)
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, mimeType, size, createdTime, webViewLink, webContentLink'
    });

    console.log('✅ File uploaded to Google Drive:', response.data.name);
    
    // Delete local temp file after successful upload
    fs.unlinkSync(filePath);
    
    return response.data;
  } catch (error) {
    console.error('❌ Google Drive upload error:', error.message);
    throw error;
  }
}

// Get file metadata from Google Drive
export async function getFileMetadata(fileId) {
  try {
    const response = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, size, createdTime, webViewLink, webContentLink'
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to get file metadata:', error.message);
    throw error;
  }
}

// Delete file from Google Drive
export async function deleteFromGoogleDrive(fileId) {
  try {
    await drive.files.delete({
      fileId: fileId
    });
    
    console.log('✅ File deleted from Google Drive:', fileId);
    return true;
  } catch (error) {
    console.error('❌ Failed to delete file:', error.message);
    throw error;
  }
}

// Download file from Google Drive
export async function downloadFromGoogleDrive(fileId) {
  try {
    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, {
      responseType: 'stream'
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Failed to download file:', error.message);
    throw error;
  }
}

// List all files in folder
export async function listFilesInFolder() {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, createdTime, webViewLink)',
      orderBy: 'createdTime desc',
      pageSize: 1000
    });
    
    return response.data.files;
  } catch (error) {
    console.error('❌ Failed to list files:', error.message);
    throw error;
  }
}
