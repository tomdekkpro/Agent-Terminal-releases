import { app } from 'electron';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import type { Persona } from '../../shared/types';
import { DEFAULT_PERSONAS } from '../../shared/types';

function getPersonasPath(): string {
  return join(app.getPath('userData'), 'insights', 'personas.json');
}

async function ensureDir(): Promise<void> {
  await mkdir(join(app.getPath('userData'), 'insights'), { recursive: true });
}

export async function loadPersonas(): Promise<Persona[]> {
  try {
    const raw = await readFile(getPersonasPath(), 'utf-8');
    const personas: Persona[] = JSON.parse(raw);
    return personas.length > 0 ? personas : DEFAULT_PERSONAS;
  } catch {
    return DEFAULT_PERSONAS;
  }
}

export async function savePersonas(personas: Persona[]): Promise<void> {
  await ensureDir();
  await writeFile(getPersonasPath(), JSON.stringify(personas, null, 2));
}

export async function addPersona(persona: Persona): Promise<Persona[]> {
  const personas = await loadPersonas();
  personas.push(persona);
  await savePersonas(personas);
  return personas;
}

export async function updatePersona(id: string, updates: Partial<Persona>): Promise<Persona[]> {
  const personas = await loadPersonas();
  const idx = personas.findIndex((p) => p.id === id);
  if (idx !== -1) {
    personas[idx] = { ...personas[idx], ...updates, id };
    await savePersonas(personas);
  }
  return personas;
}

export async function deletePersona(id: string): Promise<Persona[]> {
  let personas = await loadPersonas();
  personas = personas.filter((p) => p.id !== id);
  await savePersonas(personas);
  return personas;
}

export async function resetPersonas(): Promise<Persona[]> {
  await savePersonas(DEFAULT_PERSONAS);
  return DEFAULT_PERSONAS;
}
