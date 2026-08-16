
## testcases / python-blocks-and-dollar-lines
```
init python in test:
def afunction():
if renpy.is_in_test():
return "test"
return "not test"

testcase default:
$ print(test.afunction()) # ends up in the console
```