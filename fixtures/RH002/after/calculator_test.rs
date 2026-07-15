use calculator::add;

#[test]
fn adds_two_numbers() {
    let result = add(1, 2);
    assert!(result.is_some());
}
