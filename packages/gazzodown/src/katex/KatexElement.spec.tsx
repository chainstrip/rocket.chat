import { render } from '@testing-library/react';

import KatexElement from './KatexElement';

it('renders an inline formula with superscripts, greek letters and operators', () => {
	const { container } = render(<KatexElement code={'\\alpha^2 + \\beta_1 \\cdot \\gamma \\leq \\infty'} />);
	container.querySelector('math')?.remove();

	const katex = container.querySelector('.katex');
	expect(katex).toBeInTheDocument();
	expect(container.querySelector('.katex-display')).not.toBeInTheDocument();
	expect(katex?.querySelector('.msupsub')).toBeInTheDocument();
	expect(katex?.querySelector('.mrel')).toBeInTheDocument();
	expect(katex).toHaveTextContent('α');
});

it('renders bold, accented and sized text', () => {
	const { container } = render(<KatexElement code={'\\mathbf{v} \\hat{x} \\bar{y} \\vec{z} \\left( \\big| a \\big| \\right)'} />);
	container.querySelector('math')?.remove();

	const katex = container.querySelector('.katex');
	expect(katex?.querySelector('.mathbf')).toBeInTheDocument();
	expect(katex?.querySelector('.accent')).toBeInTheDocument();
	expect(katex?.querySelectorAll('.delimsizing').length).toBeGreaterThan(0);
});

it('renders colors and font commands', () => {
	const { container } = render(<KatexElement code={'\\color{red}{x} \\textcolor{blue}{y} \\mathcal{L} \\mathbb{R} \\overset{?}{=}'} />);
	container.querySelector('math')?.remove();

	const katex = container.querySelector('.katex');
	expect(katex?.querySelector('[style*="color"]')).toBeInTheDocument();
	expect(katex?.querySelector('.mathcal')).toBeInTheDocument();
	expect(katex?.querySelector('.mathbb')).toBeInTheDocument();
});
