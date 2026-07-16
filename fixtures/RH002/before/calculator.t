use strict;
use warnings;
use Test::More;
use Calculator qw(add);

is(add(2, 3), 5, 'adds two numbers');

done_testing();
