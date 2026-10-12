import { describe, expect, it, vi } from 'vitest';
import grammar from '../../src/data/practice/grammar.json';
import listening from '../../src/data/practice/listening.json';
import reading from '../../src/data/practice/reading.json';
import speaking from '../../src/data/practice/speaking.json';
import vocabulary from '../../src/data/practice/vocabulary.json';
import writing from '../../src/data/practice/writing.json';
import { instructorSavePracticeContentCore } from '../../functions/src/instructor/save-practice-content.js';
import { fakeDb, fakeFieldValue } from './helpers/fakes.js';

const actor = { uid: 'instructor1', role: 'instructor' };
const env = () => ({ db: fakeDb(), FieldValue: fakeFieldValue(), audit: vi.fn() });
const call = (deps, skillId, content) => instructorSavePracticeContentCore(deps, { actor, data: { skillId, content } });

describe('instructorSavePracticeContent', () => {
  it('stores a valid skill curriculum and audits the change', async () => {
    const deps = env();
    await expect(call(deps, 'grammar', grammar)).resolves.toEqual({ skillId: 'grammar', lessonCount: grammar.lessons.length });
    expect(deps.db.store.get('practiceContent/grammar')).toMatchObject({ skill: 'grammar', lessons: grammar.lessons, updatedBy: actor.uid });
    expect(deps.audit).toHaveBeenCalledWith({
      actorId: actor.uid,
      action: 'practice_content.update',
      resource: { type: 'practice-content', id: 'grammar' },
      metadata: { lessonCount: grammar.lessons.length },
    });
  });

  it('accepts the distinct writing curriculum shape', async () => {
    await expect(call(env(), 'writing', writing)).resolves.toMatchObject({ skillId: 'writing' });
  });

  it('accepts each bundled curriculum shape', async () => {
    for (const [skillId, content] of Object.entries({ grammar, vocabulary, reading, listening, speaking, writing })) {
      await expect(call(env(), skillId, content)).resolves.toMatchObject({ skillId, lessonCount: content.lessons.length });
    }
  });

  it('allows an instructor to clear a skill curriculum', async () => {
    await expect(call(env(), 'grammar', { skill: 'grammar', lessons: [] }))
      .resolves.toEqual({ skillId: 'grammar', lessonCount: 0 });
  });

  it('rejects invalid skill shapes and answer references', async () => {
    const bad = structuredClone(grammar);
    bad.lessons[0].questions[0].answer = 99;
    await expect(call(env(), 'grammar', bad)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(env(), 'unknown', grammar)).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});