use strict;
use warnings;
use Test::More;
use Calculator qw(add);

ok(add(2, 3), 'adds two numbers');

done_testing();
