import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const API_HOST = process.env.NEXT_PUBLIC_API_HOST || 'http://localhost:8000/';

// Cookie configuration
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Create form data for OAuth2 token endpoint
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    // Call the backend API to get the token
    const response = await axios.post(`${API_HOST}token`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token } = response.data;

    // Set HttpOnly cookie with the token
    // Using secure flag in production, sameSite for CSRF protection
    const isProduction = process.env.NODE_ENV === 'production';
    res.setHeader(
      'Set-Cookie',
      `auth_token=${access_token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SECONDS}${isProduction ? '; Secure' : ''}`
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    if (axios.isAxiosError(error) && error.response) {
      return res.status(error.response.status).json({
        message: error.response.data?.detail || 'Login failed',
      });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
}
