import { extractJsonObject, stripJsonFence } from './json.util';

describe('json.util', () => {
  describe('stripJsonFence', () => {
    it('removes markdown fences', () => {
      expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    });
  });

  describe('extractJsonObject', () => {
    it('extracts an object from fenced or surrounding text', () => {
      expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
      expect(extractJsonObject('before {"b":2} after')).toEqual({ b: 2 });
    });

    it('returns empty object for invalid or non-object JSON', () => {
      expect(extractJsonObject('[1,2]')).toEqual({});
      expect(extractJsonObject('not json')).toEqual({});
    });
  });
});
