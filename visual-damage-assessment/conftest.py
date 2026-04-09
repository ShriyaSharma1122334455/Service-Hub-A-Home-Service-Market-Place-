# Exclude the manual integration-test script from pytest collection.
# test_api.py is a CLI tool that requires a running server and is not
# a standard pytest test file.
collect_ignore = ["test_api.py"]
