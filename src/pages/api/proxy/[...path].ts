import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import formidable from 'formidable';
import fs from 'fs';
import FormData from 'form-data';

const API_HOST = process.env.NEXT_PUBLIC_API_HOST || 'http://localhost:8000/';

/**
 * Helper to read the request body as a buffer
 */
async function readBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * API proxy handler that forwards requests to the backend API
 * and includes the auth token from HttpOnly cookie
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { path } = req.query;
    const apiPath = Array.isArray(path) ? path.join('/') : path;
    
    // Get token from HttpOnly cookie
    const token = req.cookies.auth_token;

    // Prepare headers
    const headers: Record<string, string> = {};
    
    // Include auth token if available
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Build the backend URL
    const url = `${API_HOST}${apiPath}`;

    // Determine response type based on the endpoint
    const isDownload = apiPath?.includes('/download');
    const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
    const isJson = req.headers['content-type']?.includes('application/json');

    let requestData: Buffer | FormData | Record<string, unknown> | undefined = undefined;
    
    // Handle file uploads
    if (isMultipart) {
      const form = formidable({});
      const [, files] = await form.parse(req);
      
      // Create FormData to forward to backend
      const formData = new FormData();
      
      // Add files
      if (files.file && files.file.length > 0) {
        const file = files.file[0];
        formData.append('file', fs.createReadStream(file.filepath), {
          filename: file.originalFilename || 'file',
          contentType: file.mimetype || 'application/octet-stream',
        });
      }
      
      requestData = formData;
      // Set proper headers from FormData
      Object.assign(headers, formData.getHeaders());
    } else if (isJson && req.method !== 'GET') {
      // Parse JSON body manually since bodyParser is disabled
      const bodyBuffer = await readBody(req);
      if (bodyBuffer.length > 0) {
        requestData = JSON.parse(bodyBuffer.toString('utf8'));
      }
      headers['Content-Type'] = 'application/json';
    } else if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'] as string;
    }
    
    // Forward the request to the backend API
    const response = await axios({
      method: req.method,
      url,
      headers,
      data: requestData,
      params: (() => {
        // Filter out the 'path' parameter from query string
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { path: _, ...otherParams } = req.query;
        return Object.keys(otherParams).length > 0 ? otherParams : undefined;
      })(),
      responseType: isDownload ? 'arraybuffer' : 'json',
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    // For blob/download responses, forward the binary data
    if (isDownload) {
      res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
      if (response.headers['content-disposition']) {
        res.setHeader('Content-Disposition', response.headers['content-disposition']);
      }
      return res.status(response.status).send(response.data);
    }

    // For JSON responses
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error('API proxy error:', error);
    if (axios.isAxiosError(error) && error.response) {
      return res.status(error.response.status).json(
        error.response.data || { message: 'API request failed' }
      );
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for file uploads
  },
};
