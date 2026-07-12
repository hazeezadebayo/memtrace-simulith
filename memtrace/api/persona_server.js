import express from 'express';
import { authenticate, enforceOrigin } from './auth_server.js';
import { loadState, saveState, recenterPersona } from '../simulith/src/utils/council_utils.js';
import { callLLM, parseJson } from '../simulith/src/llm/ai.js';
import { randomUUID } from 'node:crypto';
import { DEFAULT_CONFIG } from '../extension/env/config.js';

const router = express.Router();
router.use(enforceOrigin);

router.get('/personas', authenticate, async (req, res) => {
  try {
    const state = await loadState(req.user.uuid);
    res.json({
      activePersonas: state.personas || [],
      customPersonas: state.customPersonas || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load personas' });
  }
});

router.put('/personas/:id', authenticate, async (req, res) => {
  try {
    const state = await loadState(req.user.uuid);
    const personaId = req.params.id;
    
    // Check active council personas first
    let index = (state.personas || []).findIndex(p => p.id === personaId);
    let targetArray = state.personas;
    
    if (index < 0) {
      // Check custom personas if not in active
      index = (state.customPersonas || []).findIndex(p => p.id === personaId);
      targetArray = state.customPersonas;
    }

    if (index < 0) {
      return res.status(404).json({ error: 'Persona not found' });
    }

    targetArray[index] = recenterPersona(targetArray[index], req.body);
    await saveState(req.user.uuid, state);
    res.json({ persona: targetArray[index] });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to update persona' });
  }
});

router.post('/personas/:id/tune', authenticate, async (req, res) => {
  try {
    const state = await loadState(req.user.uuid);
    const personaId = req.params.id;
    
    // Check active council personas first
    let index = (state.personas || []).findIndex(p => p.id === personaId);
    let targetArray = state.personas;
    
    if (index < 0) {
      // Check custom personas if not in active
      index = (state.customPersonas || []).findIndex(p => p.id === personaId);
      targetArray = state.customPersonas;
    }

    if (index < 0) {
      return res.status(404).json({ error: 'Persona not found' });
    }

    targetArray[index] = recenterPersona(targetArray[index], req.body);
    await saveState(req.user.uuid, state);
    res.json({ persona: targetArray[index] });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to tune persona' });
  }
});

router.post('/personas/custom', authenticate, async (req, res) => {
  try {
    const { description, targetMode = 'council' } = req.body;
    if (!description) {
      return res.status(400).json({ error: 'Persona description is required.' });
    }

    const state = await loadState(req.user.uuid);
    if (!state.customPersonas) state.customPersonas = [];

    // Calculate maximum allowed custom personas
    const personaCountLimit = Number(state.settings?.personaCount) || DEFAULT_CONFIG.LIMITS.council.maxPersonas;
    const agentCountLimit = Number(state.settings?.agentCount) || DEFAULT_CONFIG.LIMITS.mesh.maxAgents;
    const maxAllowed = Math.max(personaCountLimit, agentCountLimit);

    if (state.customPersonas.length >= maxAllowed) {
      return res.status(403).json({ error: `Maximum custom persona limit reached (${maxAllowed}). Please remove an existing custom persona before creating a new one.` });
    }

    const { generateCustomPersonaFromDescription } = await import('../simulith/src/agents/generative.js');
    const parsed = await generateCustomPersonaFromDescription(description);

    const newPersona = {
      ...parsed,
      id: `custom-persona-${randomUUID()}`,
      isCustom: true,
      name: parsed.name || 'Anonymous Analyst',
      reliability: 0.5,
      wins: 0,
      losses: 0
    };

    // Calculate cluster based on the derived metrics
    const { pickCluster } = await import('../simulith/src/agents/personas.js');
    newPersona.cluster = pickCluster(newPersona);
    newPersona.note = parsed.bio;

    state.customPersonas.push(newPersona);
    await saveState(req.user.uuid, state);

    res.json({ persona: newPersona, count: state.customPersonas.length, limit: maxAllowed });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to create custom persona' });
  }
});

router.delete('/personas/custom/:id', authenticate, async (req, res) => {
  try {
    const state = await loadState(req.user.uuid);
    if (!state.customPersonas) {
      return res.status(404).json({ error: 'No custom personas found.' });
    }

    const initialLength = state.customPersonas.length;
    state.customPersonas = state.customPersonas.filter(p => p.id !== req.params.id);

    if (state.customPersonas.length === initialLength) {
      return res.status(404).json({ error: 'Custom persona not found.' });
    }

    await saveState(req.user.uuid, state);
    res.json({ success: true, count: state.customPersonas.length });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete custom persona' });
  }
});

export default router;
