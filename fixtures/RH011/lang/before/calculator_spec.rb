require 'calculator'

describe Calculator do
  it 'adds two numbers' do
    expect(Calculator.add(2, 3)).to eq(5)
  end

  it 'subtracts two numbers' do
    expect(Calculator.subtract(5, 2)).to eq(3)
  end
end
