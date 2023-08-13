import assignWithDepth from '../../../assignWithDepth.js';
import { MermaidConfigOptions, defaultConfig } from '../../../config.js';
import { MermaidConfig } from '../../../config.type.js';
import plugin from './detector.js';
import { describe, it } from 'vitest';

function config(config: MermaidConfigOptions): MermaidConfig {
  return assignWithDepth(assignWithDepth({}, defaultConfig), config);
}

const { detector } = plugin;

describe('flowchart-elk detector', () => {
  it('should fail for dagre-d3', () => {
    expect(
      detector(
        'flowchart',
        config({
          flowchart: {
            defaultRenderer: 'dagre-d3',
          },
        })
      )
    ).toBe(false);
  });
  it('should fail for dagre-wrapper', () => {
    expect(
      detector(
        'flowchart',
        config({
          flowchart: {
            defaultRenderer: 'dagre-wrapper',
          },
        })
      )
    ).toBe(false);
  });
  it('should succeed for elk', () => {
    expect(
      detector(
        'flowchart',
        config({
          flowchart: {
            defaultRenderer: 'elk',
          },
        })
      )
    ).toBe(true);
    expect(
      detector(
        'graph',
        config({
          flowchart: {
            defaultRenderer: 'elk',
          },
        })
      )
    ).toBe(true);
  });

  it('should detect flowchart-elk', () => {
    expect(detector('flowchart-elk')).toBe(true);
  });

  it('should not detect class with defaultRenderer set to elk', () => {
    expect(
      detector(
        'class',
        config({
          flowchart: {
            defaultRenderer: 'elk',
          },
        })
      )
    ).toBe(false);
  });
});
