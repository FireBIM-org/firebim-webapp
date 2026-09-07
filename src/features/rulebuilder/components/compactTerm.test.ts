import { describe, expect, it } from 'vitest';

import { compactExpression, compactTerm } from './RuleElementNode';
describe('compactTerm', () => {
  it('compacts IRIs, paths and inverse steps', () => {
    expect(compactTerm('https://firebim.org/ontologies/fbo/dk#AreaFireCompartment')).toBe(
      'fbo-dk:AreaFireCompartment',
    );
    expect(
      compactTerm(
        'https://firebim.org/ontologies/fbo#hasSubitem/https://firebim.org/ontologies/fbo/dk#IsFireExit',
      ),
    ).toBe('fbo:hasSubitem/fbo-dk:IsFireExit');
    expect(
      compactTerm(
        '^https://firebim.org/ontologies/fbo#hasSubitem/https://firebim.org/ontologies/fbo/dk#UseCategory',
      ),
    ).toBe('^fbo:hasSubitem/fbo-dk:UseCategory');
    expect(compactTerm('http://example.org/fbo/1.0/roomArea')).toBe('ex-fbo:roomArea');
    expect(compactTerm('Room')).toBe('Room');
  });
  it('compacts expressions', () => {
    expect(
      compactExpression(
        'sum($https://firebim.org/ontologies/fbo#hasSubitem/https://firebim.org/ontologies/fbo/dk#IsFireExit) + 1',
      ),
    ).toBe('sum($fbo:hasSubitem/fbo-dk:IsFireExit) + 1');
    expect(
      compactExpression(
        '$https://firebim.org/ontologies/fbo/lt#A * cosd(90 * $https://firebim.org/ontologies/fbo/lt#H / $https://firebim.org/ontologies/fbo/lt#Habs)',
      ),
    ).toBe('$fbo-lt:A * cosd(90 * $fbo-lt:H / $fbo-lt:Habs)');
  });
});
