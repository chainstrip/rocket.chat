import { expect } from 'chai';
import { describe, it } from 'mocha';

import { isWidget } from './isWidget';

describe('isWidget', () => {
	it('should return true for a livechat room requested from the widget', () => {
		const headers = new Headers({ cookie: 'rc_room_type=l; rc_is_widget=t; rc_uid=abc' });

		expect(isWidget(headers)).to.be.equal(true);
	});

	it('should return false when the room is not a livechat room', () => {
		const headers = new Headers({ cookie: 'rc_room_type=c; rc_is_widget=t' });

		expect(isWidget(headers)).to.be.equal(false);
	});

	it('should return false when the widget flag is not set', () => {
		const headers = new Headers({ cookie: 'rc_room_type=l; rc_is_widget=f' });

		expect(isWidget(headers)).to.be.equal(false);
	});

	it('should return false when there is no cookie header', () => {
		expect(isWidget(new Headers())).to.be.equal(false);
	});

	it('should decode URL-encoded cookie values', () => {
		const headers = new Headers({ cookie: 'rc_room_type=%6C; rc_is_widget=%74' });

		expect(isWidget(headers)).to.be.equal(true);
	});
});
