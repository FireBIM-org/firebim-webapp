import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Clear the auth cookie by setting it with Max-Age=0
    res.setHeader(
      'Set-Cookie',
      'auth_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
