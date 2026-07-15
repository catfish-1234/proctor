require 'calculator'

describe Calculator do
  it 'adds two numbers' do
    result = Calculator.add(1, 2)
    expect(result).to eq(3)
  end
end
