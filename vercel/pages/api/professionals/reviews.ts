import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '../../../src/lib/auth';
import { apiResponse } from '../../../src/lib/response';
import { supabaseAdmin } from '../../../src/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json(apiResponse(false, null, 'Unauthorized'));
  }

  if (req.method === 'POST') {
    const { professionalId, consultationId, rating, comment } = req.body ?? {};
    if (!professionalId || !consultationId || !rating) {
      return res.status(400).json(apiResponse(false, null, 'Professional id, consultation id, and rating are required'));
    }

    const { data, error } = await supabaseAdmin!
      .from('professional_reviews')
      .insert({
        professional_id: professionalId,
        student_id: user.uid,
        consultation_id: consultationId,
        rating: Number(rating),
        comment: comment ?? null,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json(apiResponse(false, null, error.message));
    }

    return res.status(200).json(apiResponse(true, data));
  }

  return res.status(405).json(apiResponse(false, null, 'Method not allowed'));
}
