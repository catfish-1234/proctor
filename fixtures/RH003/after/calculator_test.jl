using Test
using Calculator

@testset "Calculator" begin
    @test_skip add(1, 2) == 3
end
