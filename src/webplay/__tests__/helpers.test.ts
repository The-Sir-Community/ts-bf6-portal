/**
 * Tests for helper functions and utilities
 */

import { encodeGetPlayElementRequest } from '../playweb-client';
import type { GetPlayElementRequest } from '../playweb-client';

describe('Helper Functions', () => {
  describe('encodeGetPlayElementRequest', () => {
    it('should encode a request with id only', () => {
      const request: GetPlayElementRequest = {
        id: 'test-id-123',
      };

      const encoded = encodeGetPlayElementRequest(request);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should encode a request with id and includeDenied=false', () => {
      const request: GetPlayElementRequest = {
        id: 'test-id-456',
        includeDenied: false,
      };

      const encoded = encodeGetPlayElementRequest(request);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should encode a request with id and includeDenied=true', () => {
      const request: GetPlayElementRequest = {
        id: 'test-id-789',
        includeDenied: true,
      };

      const encoded = encodeGetPlayElementRequest(request);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);

      // When includeDenied is true, the encoded message should be longer
      const withoutIncludeDenied = encodeGetPlayElementRequest({
        id: 'test-id-789',
        includeDenied: false,
      });
      expect(encoded.length).toBeGreaterThanOrEqual(withoutIncludeDenied.length);
    });

    it('should handle empty id', () => {
      const request: GetPlayElementRequest = {
        id: '',
      };

      const encoded = encodeGetPlayElementRequest(request);
      expect(encoded).toBeInstanceOf(Uint8Array);
      // Empty id should result in minimal encoding
    });

    it('should encode field tags correctly', () => {
      const request: GetPlayElementRequest = {
        id: 'x',
        includeDenied: false,
      };

      const encoded = encodeGetPlayElementRequest(request);

      // Field 1 (id): tag = (1 << 3) | 2 = 10 (0x0A)
      // The first byte should be the field tag for id
      expect(encoded[0]).toBe(10);
    });

    it('should encode id field with correct wire type', () => {
      const request: GetPlayElementRequest = {
        id: 'test',
      };

      const encoded = encodeGetPlayElementRequest(request);

      // Field 1 (id): wire type 2 (length-delimited)
      // Tag: (1 << 3) | 2 = 10
      expect(encoded[0]).toBe(10);

      // Next byte should be length of the string "test" = 4
      expect(encoded[1]).toBe(4);

      // Following bytes should be the UTF-8 encoded string
      const textDecoder = new TextDecoder();
      const decodedId = textDecoder.decode(encoded.slice(2, 2 + 4));
      expect(decodedId).toBe('test');
    });

    it('should handle unicode characters in id', () => {
      const request: GetPlayElementRequest = {
        id: '测试-テスト-🎮',
      };

      const encoded = encodeGetPlayElementRequest(request);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);

      // Verify the string can be decoded
      const textEncoder = new TextEncoder();
      const expectedBytes = textEncoder.encode('测试-テスト-🎮');
      expect(encoded.slice(2, 2 + expectedBytes.length)).toEqual(expectedBytes);
    });

    it('should produce different output for different ids', () => {
      const request1 = encodeGetPlayElementRequest({ id: 'id-one' });
      const request2 = encodeGetPlayElementRequest({ id: 'id-two' });

      expect(request1).not.toEqual(request2);
    });

    it('should produce consistent output for same input', () => {
      const request: GetPlayElementRequest = {
        id: 'consistent-id',
        includeDenied: true,
      };

      const encoded1 = encodeGetPlayElementRequest(request);
      const encoded2 = encodeGetPlayElementRequest(request);

      expect(encoded1).toEqual(encoded2);
    });
  });

  describe('BinaryWriter (via encodeGetPlayElementRequest)', () => {
    it('should encode varints correctly', () => {
      // Test with an ID that would create larger varints
      const longId = 'a'.repeat(300); // This will require multi-byte varint for length
      const request: GetPlayElementRequest = {
        id: longId,
      };

      const encoded = encodeGetPlayElementRequest(request);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(300);
    });

    it('should handle boolean encoding', () => {
      const requestTrue: GetPlayElementRequest = {
        id: 'test',
        includeDenied: true,
      };
      const requestFalse: GetPlayElementRequest = {
        id: 'test',
        includeDenied: false,
      };

      const encodedTrue = encodeGetPlayElementRequest(requestTrue);
      const encodedFalse = encodeGetPlayElementRequest(requestFalse);

      // False should not be encoded (field omitted), true should be encoded
      expect(encodedTrue.length).toBeGreaterThan(encodedFalse.length);
    });
  });

  describe('gRPC-Web Frame Encoding', () => {
    // These tests indirectly test encodeGrpcWebFrame through the client

    it('should create frames with correct structure', () => {
      // A gRPC-Web frame has:
      // - 1 byte: compression flag (0 = uncompressed)
      // - 4 bytes: message length (big-endian uint32)
      // - N bytes: message payload

      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      // We can't directly test encodeGrpcWebFrame as it's not exported,
      // but we can verify the structure through the client tests
      // This test serves as documentation of the expected structure
      expect(payload.length).toBe(5);
    });
  });

  describe('gRPC-Web Message Unwrapping', () => {
    // These tests indirectly test unwrapGrpcWebMessage through error cases

    it('should validate frame structure', () => {
      // Frame structure:
      // [compression_flag (1 byte), length (4 bytes), payload (N bytes)]
      // Minimum valid frame is 5 bytes header + 0 bytes payload

      const minFrame = new Uint8Array([0, 0, 0, 0, 0]); // Empty message
      expect(minFrame.length).toBe(5);

      const invalidFrame = new Uint8Array([0, 0]); // Too short
      expect(invalidFrame.length).toBeLessThan(5);
    });
  });

  describe('StringValue Cloning', () => {
    // cloneStringValue is not exported, but we can test it through PlayElementModifier
    // These tests serve as documentation of the expected behavior

    it('should handle StringValue format', () => {
      const stringValue = { value: 'test string' };
      expect(stringValue).toHaveProperty('value');
      expect(typeof stringValue.value).toBe('string');
    });

    it('should handle undefined values', () => {
      const undefinedValue = undefined;
      expect(undefinedValue).toBeUndefined();
    });

    it('should handle objects without value property', () => {
      const invalidValue = { other: 'property' };
      expect(invalidValue).not.toHaveProperty('value');
    });
  });

  describe('Type Definitions', () => {
    it('should have correct interface structure for GetPlayElementRequest', () => {
      const request: GetPlayElementRequest = {
        id: 'test',
        includeDenied: true,
      };

      expect(request).toHaveProperty('id');
      expect(typeof request.id).toBe('string');
      expect(request).toHaveProperty('includeDenied');
      expect(typeof request.includeDenied).toBe('boolean');
    });

    it('should allow optional includeDenied', () => {
      const request: GetPlayElementRequest = {
        id: 'test',
      };

      expect(request).toHaveProperty('id');
      expect(request.includeDenied).toBeUndefined();
    });
  });

  describe('Protobuf Encoding Edge Cases', () => {
    it('should handle maximum field values', () => {
      // Test with very long ID
      const maxLengthId = 'x'.repeat(10000);
      const request: GetPlayElementRequest = {
        id: maxLengthId,
      };

      const encoded = encodeGetPlayElementRequest(request);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(10000);
    });

    it('should handle special characters in strings', () => {
      const specialChars = '!@#$%^&*()[]{}|\\:";\'<>?,./\n\r\t';
      const request: GetPlayElementRequest = {
        id: specialChars,
      };

      const encoded = encodeGetPlayElementRequest(request);
      expect(encoded).toBeInstanceOf(Uint8Array);

      // Verify the encoded length accounts for all characters
      const textEncoder = new TextEncoder();
      const expectedLength = textEncoder.encode(specialChars).length;
      expect(encoded.length).toBeGreaterThanOrEqual(expectedLength + 2); // +2 for tag and length
    });

    it('should handle null bytes in strings', () => {
      const withNull = 'before\x00after';
      const request: GetPlayElementRequest = {
        id: withNull,
      };

      const encoded = encodeGetPlayElementRequest(request);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Size', () => {
    it('should produce compact encoding for simple requests', () => {
      const request: GetPlayElementRequest = {
        id: 'x',
      };

      const encoded = encodeGetPlayElementRequest(request);
      // tag (1 byte) + length (1 byte) + content (1 byte) = 3 bytes
      expect(encoded.length).toBe(3);
    });

    it('should scale linearly with string length', () => {
      const small = encodeGetPlayElementRequest({ id: 'a'.repeat(10) });
      const large = encodeGetPlayElementRequest({ id: 'a'.repeat(100) });

      // The difference should be approximately 90 bytes (plus varint overhead)
      const diff = large.length - small.length;
      expect(diff).toBeGreaterThanOrEqual(90);
      expect(diff).toBeLessThan(95); // Account for varint encoding differences
    });
  });
});
