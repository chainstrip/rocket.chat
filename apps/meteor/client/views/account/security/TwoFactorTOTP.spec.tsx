import { mockAppRoot } from '@rocket.chat/mock-providers';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import TwoFactorTOTP from './TwoFactorTOTP';

const secret = 'JBSWY3DPEHPK3PXP';
const otpauthUrl = `otpauth://totp/Rocket.Chat%3Ajohn.doe?secret=${secret}`;

it('renders the QR code and secret after enabling TOTP', async () => {
	const enableTotp = jest.fn(() => ({ secret, url: otpauthUrl }));

	const { container } = render(<TwoFactorTOTP />, {
		wrapper: mockAppRoot()
			.withJohnDoe()
			.withMethod('2fa:enable', enableTotp)
			.build(),
	});

	await userEvent.click(screen.getByRole('checkbox', { name: 'Two-factor_authentication_via_TOTP' }));

	expect(await screen.findByText('Scan_QR_code')).toBeInTheDocument();
	expect(enableTotp).toHaveBeenCalledTimes(1);
	expect(screen.getByText(secret)).toBeInTheDocument();

	const qr = container.querySelector('img');
	expect(qr).toBeInTheDocument();
	expect(qr?.getAttribute('src')).toMatch(/^data:image\/gif;base64,/);
	expect(qr?.getAttribute('src')?.length).toBeGreaterThan(1000);
	expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();
});

it('shows only the toggle before TOTP is enabled', () => {
	const { container } = render(<TwoFactorTOTP />, {
		wrapper: mockAppRoot().withJohnDoe().build(),
	});

	expect(screen.getByRole('checkbox', { name: 'Two-factor_authentication_via_TOTP' })).not.toBeChecked();
	expect(screen.queryByText('Scan_QR_code')).not.toBeInTheDocument();
	expect(container.querySelector('img')).not.toBeInTheDocument();
});
