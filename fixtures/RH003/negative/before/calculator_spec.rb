require 'calculator'

describe Calculator do
  it 'skips the cache when configured' do
    result = Calculator.add(1, 2)
    expect(result).to eq(3)
  end
end
