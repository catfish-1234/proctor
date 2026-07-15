require 'calculator'

describe Calculator do
  it 'skips the cache when configured' do
    skip = compute_skip(2)
    result = Calculator.add(1, skip)
    expect(result).to eq(3)
  end
end
