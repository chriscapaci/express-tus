// @flow

import test from 'ava';
import sinon from 'sinon';
import got from 'got';
import createMemoryStorage from '../../../src/factories/createMemoryStorage';
import {
  NotFoundError,
} from '../../../src/errors';
import createTestServer from '../../helpers/createTestServer';

test('OPTIONS successful response produces 204', async (t) => {
  const server = await createTestServer({});

  const response = await got(server.url, {
    method: 'OPTIONS',
  });

  t.is(response.statusCode, 204);
  t.is(response.body, '');
});

test('OPTIONS describes tus-version', async (t) => {
  const server = await createTestServer({});

  const response = await got(server.url, {
    method: 'OPTIONS',
  });

  t.is(response.headers['tus-version'], '1.0.0');
});

test('OPTIONS describes tus-extension', async (t) => {
  const server = await createTestServer({});

  const response = await got(server.url, {
    method: 'OPTIONS',
  });

  t.is(response.headers['tus-extension'], 'creation, termination');
});

test('empty POST creates a new upload resource', async (t) => {
  const server = await createTestServer({
    ...createMemoryStorage(),
    createUid: () => {
      return 'foo';
    },
  });

  const response = await got(server.url, {
    headers: {
      'tus-resumable': '1.0.0',
      'upload-length': '100',
    },
    method: 'POST',
  });

  t.is(response.headers.location, '/foo');
  t.is(response.statusCode, 201);
  t.is(response.body, '');
});

test('rejected POST produces error response using formatErrorResponse', async (t) => {
  const server = await createTestServer({
    createUpload: async () => {
      throw new Error('foo');
    },
    formatErrorResponse: () => {
      return {
        body: 'Unauthorized',
        headers: {},
        statusCode: 401,
      };
    },
  });

  const response = await got(server.url, {
    headers: {
      'tus-resumable': '1.0.0',
      'upload-length': '100',
    },
    method: 'POST',
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 401);
  t.is(response.body, 'Unauthorized');
});

test('location is resolved using base-path configuration', async (t) => {
  const server = await createTestServer({
    ...createMemoryStorage(),
    basePath: '/foo',
    createUid: () => {
      return 'bar';
    },
  });

  const response = await got(server.url, {
    headers: {
      'tus-resumable': '1.0.0',
      'upload-length': '100',
    },
    method: 'POST',
  });

  t.is(response.headers.location, '/foo/bar');
  t.is(response.statusCode, 201);
  t.is(response.body, '');
});

test('x-http-method-override produces 501 (not implemented)', async (t) => {
  const server = await createTestServer({});

  const response = await got(server.url, {
    headers: {
      'tus-resumable': '1.0.0',
      'x-http-method-override': 'PATCH',
    },
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 501);
  t.is(response.body, 'Not implemented.');
});

test('upload-defer-length produces 501 (not implemented)', async (t) => {
  const server = await createTestServer({});

  const response = await got(server.url, {
    headers: {
      'tus-resumable': '1.0.0',
      'upload-defer-length': '1',
    },
    method: 'POST',
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 501);
  t.is(response.body, 'Not implemented.');
});

test('createUpload is called with the original incomingMessage', async (t) => {
  const createUpload = sinon.stub().returns(null);

  const server = await createTestServer({
    createUpload,
  });

  await got(server.url, {
    headers: {
      foo: 'bar',
      'tus-resumable': '1.0.0',
      'upload-length': '100',
    },
    method: 'POST',
  });

  t.is(createUpload.firstCall.firstArg.incomingMessage.headers.foo, 'bar');
  t.is(createUpload.firstCall.firstArg.incomingMessage.url, '/');
});

test('createUpload is called with the original upload-metadata', async (t) => {
  const createUpload = sinon.stub().returns(null);

  const server = await createTestServer({
    createUpload,
  });

  await got(server.url, {
    headers: {
      foo: 'bar',
      'tus-resumable': '1.0.0',
      'upload-length': '100',
      'upload-metadata': 'foo YmFy, baz cXV4',
    },
    method: 'POST',
  });

  t.deepEqual(createUpload.firstCall.firstArg.uploadMetadata, {
    baz: 'qux',
    foo: 'bar',
  });
});

test('createUpload is called with the original upload-length', async (t) => {
  const createUpload = sinon.stub().returns(null);

  const server = await createTestServer({
    createUpload,
  });

  await got(server.url, {
    headers: {
      foo: 'bar',
      'tus-resumable': '1.0.0',
      'upload-length': '100',
    },
    method: 'POST',
  });

  t.is(createUpload.firstCall.firstArg.uploadLength, 100);
});

test('PATCH request with unsupported content-type produces 415', async (t) => {
  const server = await createTestServer({});

  const response = await got(server.url + '/foo', {
    headers: {
      'content-type': 'application/json',
      'tus-resumable': '1.0.0',
      'upload-length': '100',
    },
    method: 'PATCH',
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 415);
});

test('PATCH with an unexpected upload-offset produces 409 conflict', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      return {
        uploadOffset: 0,
      };
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'content-type': 'application/offset+octet-stream',
      'tus-resumable': '1.0.0',
      'upload-length': '100',
      'upload-offset': '50',
    },
    method: 'PATCH',
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 409);
});

test('PATCH produces 404 if upload is not found', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      throw new NotFoundError();
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'content-type': 'application/offset+octet-stream',
      'tus-resumable': '1.0.0',
      'upload-length': '100',
      'upload-offset': '50',
    },
    method: 'PATCH',
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 404);
});

test('produces 400 if PATCH request is made without upload-offset', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      return {
        uploadOffset: 0,
      };
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'content-type': 'application/offset+octet-stream',
      'tus-resumable': '1.0.0',
      'upload-length': '100',
    },
    method: 'PATCH',
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 400);
});

test('PATCH produces error response using formatErrorResponse', async (t) => {
  const server = await createTestServer({
    formatErrorResponse: () => {
      return {
        body: 'Unauthorized',
        headers: {},
        statusCode: 401,
      };
    },
    getUpload: () => {
      return {
        uploadLength: 100,
        uploadOffset: 0,
      };
    },
    upload: async () => {
      throw new Error('foo');
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'content-type': 'application/offset+octet-stream',
      'tus-resumable': '1.0.0',
      'upload-length': '100',
      'upload-offset': '0',
    },
    method: 'PATCH',
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 401);
});

test('produces 404 upload cannot be found', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      throw new NotFoundError();
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'content-type': 'application/offset+octet-stream',
      'tus-resumable': '1.0.0',
      'upload-length': '100',
      'upload-offset': '0',
    },
    method: 'PATCH',
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 404);
});

test('successful PATCH produces 204', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      return {
        uploadOffset: 0,
      };
    },
    upload: () => {
      return {
        uploadOffset: 100,
      };
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'content-type': 'application/offset+octet-stream',
      'tus-resumable': '1.0.0',
      'upload-length': '100',
      'upload-offset': '0',
    },
    method: 'PATCH',
  });

  t.is(response.statusCode, 204);
});

test('HEAD produces 404 when upload cannot be found', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      throw new NotFoundError();
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'tus-resumable': '1.0.0',
    },
    method: 'HEAD',
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 404);
});

test('successful HEAD produces 200', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      return {
        uploadLength: 100,
        uploadMetadata: {},
        uploadOffset: 100,
      };
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'tus-resumable': '1.0.0',
    },
    method: 'HEAD',
  });

  t.is(response.statusCode, 200);
});

test('successful HEAD describes upload-length', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      return {
        uploadLength: 100,
        uploadMetadata: {},
        uploadOffset: 50,
      };
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'tus-resumable': '1.0.0',
    },
    method: 'HEAD',
  });

  t.is(response.headers['upload-length'], '100');
});

test('successful HEAD describes upload-offset', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      return {
        uploadLength: 100,
        uploadMetadata: {},
        uploadOffset: 50,
      };
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'tus-resumable': '1.0.0',
    },
    method: 'HEAD',
  });

  t.is(response.headers['upload-offset'], '50');
});

test('successful HEAD describes meta-data', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      return {
        uploadLength: 100,
        uploadMetadata: {
          baz: 'qux',
          foo: 'bar',
        },
        uploadOffset: 50,
      };
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'tus-resumable': '1.0.0',
    },
    method: 'HEAD',
  });

  t.is(response.headers['upload-metadata'], 'baz cXV4, foo YmFy');
});

test('not found upload DELETE responds with 404', async (t) => {
  const server = await createTestServer({
    getUpload: () => {
      throw new NotFoundError();
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'tus-resumable': '1.0.0',
    },
    method: 'DELETE',
    throwHttpErrors: false,
  });

  t.is(response.statusCode, 404);
});

test('successful DELETE responds with 204', async (t) => {
  const deleteUpload = sinon.stub();

  const server = await createTestServer({
    delete: deleteUpload,
    getUpload: () => {
      return {
        uploadLength: 100,
        uploadOffset: 0,
      };
    },
  });

  const response = await got(server.url + '/foo', {
    headers: {
      'tus-resumable': '1.0.0',
    },
    method: 'DELETE',
  });

  t.is(response.statusCode, 204);
  t.is(deleteUpload.firstCall.firstArg, 'foo');
});
