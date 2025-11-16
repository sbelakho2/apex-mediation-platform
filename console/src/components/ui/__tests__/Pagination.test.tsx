import { fireEvent, render, screen } from '@testing-library/react'
import Pagination from '../Pagination'

describe('Pagination', () => {
  it('disables navigation when no pages are available', () => {
    const onPageChange = jest.fn()
    render(<Pagination page={1} totalPages={0} onPageChange={onPageChange} />)

    expect(screen.getByText(/No pages/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to first page/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /go to last page/i })).toBeDisabled()
    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('navigates to first/last pages via controls', () => {
    const onPageChange = jest.fn()
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />)

    fireEvent.click(screen.getByRole('button', { name: /go to first page/i }))
    expect(onPageChange).toHaveBeenCalledWith(1)

    fireEvent.click(screen.getByRole('button', { name: /go to last page/i }))
    expect(onPageChange).toHaveBeenCalledWith(5)
  })

  it('commits manual page input on enter', () => {
    const onPageChange = jest.fn()
    render(<Pagination page={2} totalPages={10} onPageChange={onPageChange} />)

    const input = screen.getByLabelText(/go to page/i)
    fireEvent.change(input, { target: { value: '6' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })

    expect(onPageChange).toHaveBeenCalledWith(6)
  })
})
