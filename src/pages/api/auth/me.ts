import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const API_HOST = process.env.NEXT_PUBLIC_API_HOST || 'http://localhost:8000/';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Get token from HttpOnly cookie
    const token = req.cookies.auth_token;

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Call the backend API to get user data
    const response = await axios.get(`${API_HOST}users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Get user error:', error);
    if (axios.isAxiosError(error) && error.response) {
      return res.status(error.response.status).json({
        message: error.response.data?.detail || 'Failed to get user data',
      });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
}
