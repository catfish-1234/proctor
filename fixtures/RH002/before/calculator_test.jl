using Test
include("../src/calculator.jl")

@testset "Calculator" begin
    @test add(2, 3) == 5
end
