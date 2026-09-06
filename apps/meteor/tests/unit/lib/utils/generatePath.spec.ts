import { expect } from 'chai';
import { describe, it } from 'mocha';

import { generatePath } from '../../../../lib/utils/generatePath';

describe('generatePath', () => {
	it('should return a static path unchanged', () => {
		expect(generatePath('/home')).to.be.equal('/home');
	});

	it('should fill in named params', () => {
		expect(generatePath('/group/:name', { name: 'general' })).to.be.equal('/group/general');
	});

	it('should fill in several params in order', () => {
		expect(generatePath('/room/:rid/thread/:tmid', { rid: 'GENERAL', tmid: 'abc123' })).to.be.equal('/room/GENERAL/thread/abc123');
	});

	it('should omit an optional param that is not provided', () => {
		expect(generatePath('/admin/rooms/:context?', {})).to.be.equal('/admin/rooms');
	});

	it('should include an optional param that is provided', () => {
		expect(generatePath('/admin/rooms/:context?', { context: 'edit' })).to.be.equal('/admin/rooms/edit');
	});

	it('should URI-encode param values', () => {
		expect(generatePath('/direct/:rid', { rid: 'a b/c' })).to.be.equal('/direct/a%20b%2Fc');
	});

	it('should throw when a required param is missing', () => {
		expect(() => generatePath('/group/:name', {})).to.throw();
	});
});
