import { describe, expect, it } from 'vitest';
import { diagramStart, preprocess } from './index.js';

const rest = (src: string) => src.slice(diagramStart(src, preprocess(src)));

describe('diagramStart', () => {
  it.each([
    ['plain', 'graph TD\nA-->B', 'graph TD\nA-->B'],
    ['leading blanks', '\n\n  \tgraph TD', 'graph TD'],
    ['unicode spaces, as v12 \\s', ' ﻿ graph TD', 'graph TD'],
    ['front matter', '---\ntitle: x\n---\n\nflowchart LR', 'flowchart LR'],
    ['comments', '%% one\n  %% two\r\n%%\nflowchart LR', 'flowchart LR'],
    ['directive', '%%{init: {"theme": "dark"}}%%\ngraph TD', 'graph TD'],
    ['directive then keyword on one line', '%%{wrap}%%graph TD', 'graph TD'],
    ['several directives', '%%{wrap}%% %%{init: {}}%%\n%% c\ngraph TD', 'graph TD'],
    ['multi-line directive', '%%{init: {\n"theme": "dark"\n}}%%\ngraph TD', 'graph TD'],
    ['directive inside a comment', '%% note %%{wrap}%%\ngraph TD', 'graph TD'],
    [
      'directive opened in a comment, closed on a later line',
      '%% note %%{init: {\n"theme": "dark"}}%%\ngraph TD',
      'graph TD',
    ],
    ['directive after the keyword', 'graph TD\n%%{wrap}%%\nA-->B', 'graph TD\n%%{wrap}%%\nA-->B'],
    ['only trivia', '%% c\n%%{wrap}%%\n  ', ''],
    // v12 anyCommentRegex removed a `%%{` line that held no directive (#208).
    ['an opener without a name', '%%{}%%\n%%{ "a"\ngraph TD', 'graph TD'],
    [
      'a comment line after an opener: the rest is text (v12 failed in the grammar)',
      '%%{\n%% c\ninit: {}}%%\ngraph TD',
      'init: {}}%%\ngraph TD',
    ],
  ])('%s', (_name, src, expected) => {
    expect(rest(src)).toBe(expected);
  });
});
