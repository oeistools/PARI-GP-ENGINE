# PARI-GP-ENGINE — a Quarto execution engine and syntax highlighter for PARI/GP
#
# Common targets:
#   make build     compile src/pari-gp.ts to _extensions/pari-gp/pari-gp.js
#   make syntax    regenerate pari-gp.xml from the installed gp
#   make test      render the test documents and check their output
#   make examples  render everything under examples/
#   make check     doctor + build + syntax check + test
#   make clean     remove rendered output

GP      ?= gp
QUARTO  ?= quarto
PYTHON  ?= python3

EXT_DIR := _extensions/pari-gp
ENGINE  := $(EXT_DIR)/pari-gp.js
SOURCE  := src/pari-gp.ts
SYNTAX  := $(EXT_DIR)/pari-gp.xml
VERSION := $(shell cat VERSION)

.DEFAULT_GOAL := help
.PHONY: help build syntax test examples check doctor clean distclean version bump-version

help: ## Show this help
	@echo "PARI-GP-ENGINE $(VERSION)"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build: $(ENGINE) ## Compile the TypeScript engine to JavaScript

$(ENGINE): $(SOURCE)
	$(QUARTO) call build-ts-extension $(SOURCE)

syntax: ## Regenerate the syntax definition from the installed PARI/GP
	$(PYTHON) tools/gen_xml.py $(GP) $(SYNTAX)
	@$(PYTHON) -c "import xml.dom.minidom as m; m.parse('$(SYNTAX)')" \
	  && echo "$(SYNTAX): well-formed"

test: build ## Render the test documents and check their output
	./tests/run-tests.sh

examples: build ## Render every document under examples/
	$(QUARTO) render examples

doctor: ## Report whether Quarto, PARI/GP and the engine are usable
	@./install.sh --check

check: doctor build ## Run every check
	@$(PYTHON) -c "import xml.dom.minidom as m; m.parse('$(SYNTAX)')" \
	  && echo "$(SYNTAX): well-formed"
	@$(MAKE) --no-print-directory test

clean: ## Remove rendered documents and caches
	rm -rf .quarto _site
	rm -f  examples/*.html tests/cases/*.html tests/expect-fail/*.html
	rm -rf examples/*_files tests/cases/*_files tests/expect-fail/*_files

distclean: clean ## Also remove the compiled engine
	rm -f $(ENGINE)

version: ## Print the current version
	@echo $(VERSION)

bump-version: ## Set the version everywhere: make bump-version V=0.2.0
	@test -n "$(V)" || { echo "usage: make bump-version V=x.y.z" >&2; exit 1; }
	@echo "$(V)" > VERSION
	@sed -i.bak -E 's/^version: .*/version: $(V)/' $(EXT_DIR)/_extension.yml && rm -f $(EXT_DIR)/_extension.yml.bak
	@sed -i.bak -E 's/^version: .*/version: $(V)/' CITATION.cff && rm -f CITATION.cff.bak
	@echo "version is now $(V)"
