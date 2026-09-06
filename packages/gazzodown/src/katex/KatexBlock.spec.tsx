import { render, screen } from '@testing-library/react';

import KatexBlock from './KatexBlock';

it('renders a display-mode formula with fractions, roots and a sum', () => {
	const code = '\\sum_{i=1}^{n} \\frac{\\sqrt{x_i}}{2} = \\int_0^1 f(t)\\,dt';
	const { container } = render(<KatexBlock code={code} />);

	// jest-dom cannot query MathML, so drop it before using the accessible tree
	container.querySelector('math')?.remove();

	const block = screen.getByRole('math', { name: code });
	expect(block).toBeInTheDocument();
	expect(block.querySelector('.katex-display')).toBeInTheDocument();
	expect(block.querySelector('.mop.op-symbol')).toBeInTheDocument();
	expect(block.querySelector('.mfrac')).toBeInTheDocument();
	expect(block.querySelector('.sqrt')).toBeInTheDocument();
});

it('renders matrices and aligned environments', () => {
	const code = '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{aligned} x &= 1 \\\\ y &= 2 \\end{aligned}';
	const { container } = render(<KatexBlock code={code} />);
	container.querySelector('math')?.remove();

	const block = screen.getByRole('math', { name: code });
	expect(block.querySelectorAll('.mtable').length).toBeGreaterThanOrEqual(2);
	expect(block.querySelectorAll('.delimsizing').length).toBeGreaterThan(0);
	expect(block.querySelector('.col-align-r')).toBeInTheDocument();
});

it('renders \\href as its second argument only', () => {
	const code = '\\href{https://evil.example}{\\text{safe label}}';
	const { container } = render(<KatexBlock code={code} />);
	container.querySelector('math')?.remove();

	const block = screen.getByRole('math', { name: code });
	expect(block).toHaveTextContent('safe label');
	expect(block.querySelector('a')).not.toBeInTheDocument();
});

it('throws a KaTeX parse error for malformed input', () => {
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
	try {
		expect(() => render(<KatexBlock code={'\\frac{1'} />)).toThrow(/KaTeX parse error/);
	} finally {
		consoleError.mockRestore();
	}
});
