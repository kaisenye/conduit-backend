import { Router } from 'express';
import supabase from '../db.js';

const router = Router();

// GET /api/users - list users
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/users - create user
router.post('/', async (req, res) => {
  const { name, role, vendorRole } = req.body;
  if (!name || !role) {
    return res.status(400).json({ error: 'name and role are required' });
  }
  const { data, error } = await supabase
    .from('users')
    .insert([{ name, role, vendorRole }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET /api/users/:role - get first user by role
router.get('/:role', async (req, res) => {
  const { role } = req.params;

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, role, vendorRole')
      .eq('role', role.toUpperCase())
      .limit(1)
      .single();

    console.log(`Found user:`, user);

    if (error) {
      console.error('Error fetching user:', error);
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    if (!user) {
      return res.status(404).json({ error: 'No user found with this role' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 