require 'calculator'

describe Calculator do
  it 'adds two numbers' do
    expect(Calculator.add(1, 2)).to eq(3)
  end
end
