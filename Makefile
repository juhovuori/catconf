TESTS = test/*.js

coverage:
	./runcoverage.sh $(TESTS)
        
test:
	./runtests.sh $(TESTS)

.PHONY: test coverage

