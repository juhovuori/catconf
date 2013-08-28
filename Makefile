TESTS = test/*.js

coverage:
	./runcoverage.sh $(TESTS)
        
test:
	./runtests.sh $(TESTS)

jsdoc:
	./node_modules/jsdoc/jsdoc -d jsdoc .


.PHONY: test coverage jsdoc

