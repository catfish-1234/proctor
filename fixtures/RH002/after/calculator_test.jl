using Test
include("../src/calculator.jl")

@testset "Calculator" begin
    @test !isnothing(add(2, 3))
end
