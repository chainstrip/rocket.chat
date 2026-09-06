import { parse } from '../src';
import { link, paragraph, plain } from './helpers';

describe('autoLink and autoEmail fall back to plain text for hosts without a valid TLD', () => {
	test.each([
		['joe@notatld', [paragraph([plain('joe@notatld')])]],
		['contact joe@internal for help', [paragraph([plain('contact joe@internal for help')])]],
		['intranet.notatld', [paragraph([plain('intranet.notatld')])]],
		['http://intranet.notatld/page', [paragraph([plain('http://intranet.notatld/page')])]],
	])('parses %p', (input, output) => {
		expect(parse(input)).toEqual(output);
	});

	test.each([
		['joe@example.co.uk', [paragraph([link('mailto:joe@example.co.uk', [plain('joe@example.co.uk')])])]],
		['joe@10.0.0.1', [paragraph([plain('joe@10.0.0.1')])]],
		['ping 10.0.0.1 now', [paragraph([plain('ping '), link('//10.0.0.1', [plain('10.0.0.1')]), plain(' now')])]],
		['see wiki.corp', [paragraph([plain('see '), link('//wiki.corp', [plain('wiki.corp')])])]],
	])('parses %p', (input, output) => {
		expect(parse(input, { customDomains: ['corp'] })).toEqual(output);
	});
});
