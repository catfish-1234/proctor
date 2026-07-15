require 'calculator'

describe Calculator do
  it 'adds two numbers' do
    result = Calculator.add(1, 2)
    expect(result).to be_truthy
  end
end
