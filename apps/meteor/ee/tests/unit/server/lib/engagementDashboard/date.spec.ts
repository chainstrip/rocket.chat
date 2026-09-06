import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
	convertDateToInt,
	convertIntToDate,
	diffBetweenDaysInclusive,
	getTotalOfWeekItems,
	isDateISOString,
	mapDateForAPI,
	transformDatesForAPI,
} from '../../../../../server/lib/engagementDashboard/date';

describe('engagementDashboard/date', () => {
	describe('convertDateToInt', () => {
		it('should encode a date as a YYYYMMDD integer', () => {
			const date = new Date(2024, 2, 5, 13, 45); // local time, 5 March 2024

			expect(convertDateToInt(date)).to.be.equal(20240305);
		});
	});

	describe('convertIntToDate', () => {
		it('should decode a YYYYMMDD integer into the local midnight of that day', () => {
			const date = convertIntToDate(20231231);

			expect(date.getFullYear()).to.be.equal(2023);
			expect(date.getMonth()).to.be.equal(11);
			expect(date.getDate()).to.be.equal(31);
			expect(date.getHours()).to.be.equal(0);
			expect(date.getMinutes()).to.be.equal(0);
		});

		it('should round-trip with convertDateToInt', () => {
			const date = new Date(2022, 6, 14, 23, 59);

			expect(convertDateToInt(convertIntToDate(convertDateToInt(date)))).to.be.equal(20220714);
		});
	});

	describe('diffBetweenDaysInclusive', () => {
		it('should count both ends of the range', () => {
			expect(diffBetweenDaysInclusive('2024-01-08T00:00:00.000Z', '2024-01-01T00:00:00.000Z')).to.be.equal(8);
		});

		it('should return 1 for the same day', () => {
			expect(diffBetweenDaysInclusive(new Date(2024, 0, 1), new Date(2024, 0, 1))).to.be.equal(1);
		});

		it('should ignore partial days', () => {
			expect(diffBetweenDaysInclusive('2024-01-02T12:00:00.000Z', '2024-01-01T00:00:00.000Z')).to.be.equal(2);
		});
	});

	describe('isDateISOString / mapDateForAPI / transformDatesForAPI', () => {
		it('should accept a full ISO 8601 string', () => {
			expect(isDateISOString('2024-01-01T00:00:00.000Z')).to.be.equal(true);
			expect(mapDateForAPI('2024-01-01T00:00:00.000Z').getTime()).to.be.equal(Date.UTC(2024, 0, 1));
		});

		it('should reject a date that is not a full ISO 8601 string', () => {
			expect(isDateISOString('2024-01-01')).to.be.equal(false);
			expect(() => mapDateForAPI('2024-01-01')).to.throw('invalid ISO 8601 date');
		});

		it('should transform start and end dates', () => {
			const { start, end } = transformDatesForAPI('2024-01-01T00:00:00.000Z', '2024-01-31T00:00:00.000Z');

			expect(start.toISOString()).to.be.equal('2024-01-01T00:00:00.000Z');
			expect(end.toISOString()).to.be.equal('2024-01-31T00:00:00.000Z');
		});

		it('should leave the end date undefined when not provided', () => {
			const { end } = transformDatesForAPI('2024-01-01T00:00:00.000Z');

			expect(end).to.be.equal(undefined);
		});
	});

	describe('getTotalOfWeekItems', () => {
		it('should sum the given property over the items', () => {
			expect(getTotalOfWeekItems([{ users: 3 }, { users: 4 }, { users: 0 }], 'users')).to.be.equal(7);
		});
	});
});
