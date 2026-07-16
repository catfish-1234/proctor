using Test
using Calculator

@testset "Calculator" begin
    @test add(2, 3) == 5
end
