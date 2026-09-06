import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

class MeteorError extends Error {
	constructor(
		public error: string,
		public reason?: string,
	) {
		super(reason);
	}
}

const hasPermissionAsync = sinon.stub().resolves(false);
const deprecationParameter = sinon.stub();

const { parseJsonQuery } = proxyquire.noCallThru().load('./parseJsonQuery', {
	'meteor/meteor': { Meteor: { Error: MeteorError } },
	'../../lib/authorization/hasPermission': { hasPermissionAsync },
	'../../lib/deprecationWarningLogger': { apiDeprecationLogger: { parameter: deprecationParameter } },
	'../api': {
		API: {
			v1: {
				fieldSeparator: '.',
				defaultFieldsToExclude: { joinCode: 0, 'services.password': 0 },
				limitedUserFieldsToExclude: { emails: 0, services: 0 },
				limitedUserFieldsToExcludeIfIsPrivilegedUser: { services: 0 },
			},
		},
	},
});

const makeContext = (queryParams: Record<string, string>, route = '/api/v1/rooms.info') => ({
	userId: 'user-id',
	response: {},
	route,
	logger: { warn: sinon.stub() },
	queryParams,
	queryFields: [],
	queryOperations: [],
});

describe('parseJsonQuery', () => {
	let previousEnv: string | undefined;

	beforeEach(() => {
		previousEnv = process.env.ALLOW_UNSAFE_QUERY_AND_FIELDS_API_PARAMS;
		process.env.ALLOW_UNSAFE_QUERY_AND_FIELDS_API_PARAMS = 'true';
		deprecationParameter.resetHistory();
	});

	afterEach(() => {
		if (previousEnv === undefined) {
			delete process.env.ALLOW_UNSAFE_QUERY_AND_FIELDS_API_PARAMS;
		} else {
			process.env.ALLOW_UNSAFE_QUERY_AND_FIELDS_API_PARAMS = previousEnv;
		}
	});

	it('should parse an EJSON query and revive dates', async () => {
		const { query } = await parseJsonQuery(makeContext({ query: '{"ts":{"$gt":{"$date":1700000000000}},"name":"general"}' }) as any);

		expect(query.name).to.be.equal('general');
		expect(query.ts.$gt).to.be.instanceOf(Date);
		expect((query.ts.$gt as Date).getTime()).to.be.equal(1700000000000);
		expect(deprecationParameter.calledOnce).to.be.equal(true);
	});

	it('should strip operators that are not allowed and dangerous keys', async () => {
		const { query } = await parseJsonQuery(
			makeContext({ query: '{"$where":"1","$or":[{"a":1}],"__proto__":{"polluted":true},"name":{"$regex":"^g"}}' }) as any,
		);

		expect(query).to.not.have.property('$where');
		expect(query).to.not.have.property('__proto__');
		expect(query.$or).to.deep.equal([{ a: 1 }]);
		expect(query.name).to.deep.equal({ $regex: '^g' });
	});

	it('should remove excluded fields from the query', async () => {
		const { query } = await parseJsonQuery(makeContext({ query: '{"joinCode":"x","joinCode.hash":"h","services.password":"y","name":"z"}' }) as any);

		expect(query).to.deep.equal({ name: 'z' });
	});

	it('should reject an invalid EJSON query', async () => {
		let error: MeteorError | undefined;
		try {
			await parseJsonQuery(makeContext({ query: '{not json' }) as any);
		} catch (e) {
			error = e as MeteorError;
		}

		expect(error?.error).to.be.equal('error-invalid-query');
	});

	it('should ignore the query parameter when unsafe params are not allowed', async () => {
		process.env.ALLOW_UNSAFE_QUERY_AND_FIELDS_API_PARAMS = 'false';

		const { query } = await parseJsonQuery(makeContext({ query: '{"name":"general"}' }) as any);

		expect(query).to.deep.equal({});
	});

	it('should parse sort and apply the default field exclusions', async () => {
		const { sort, fields } = await parseJsonQuery(makeContext({ sort: '{"name":1,"ts":-1}' }) as any);

		expect(sort).to.deep.equal({ name: 1, ts: -1 });
		expect(fields).to.deep.equal({ joinCode: 0, 'services.password': 0 });
	});

	it('should exclude limited user fields on users routes', async () => {
		const { fields } = await parseJsonQuery(makeContext({}, '/api/v1/users.list') as any);

		expect(fields).to.deep.equal({ joinCode: 0, 'services.password': 0, emails: 0, services: 0 });
	});

	it('should reject an invalid sort direction', async () => {
		let error: MeteorError | undefined;
		try {
			await parseJsonQuery(makeContext({ sort: '{"name":2}' }) as any);
		} catch (e) {
			error = e as MeteorError;
		}

		expect(error?.error).to.be.equal('error-invalid-sort');
	});
});
