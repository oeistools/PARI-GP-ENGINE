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
RUFF    ?= ruff

EXT_DIR := _extensions/pari-gp
ENGINE  := $(EXT_DIR)/pari-gp.js
SOURCE  := src/pari-gp.ts
SYNTAX  := $(EXT_DIR)/pari-gp.xml
VERSION := $(shell cat VERSION)

.DEFAULT_GOAL := help
.PHONY: help build syntax test examples check doctor clean distclean version bump-version \
        package release-check tag docs docs-preview lint fmt

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

docs: build ## Render the documentation site into docs/_site
	$(QUARTO) render docs

docs-preview: build ## Serve the documentation site with live reload
	$(QUARTO) preview docs

lint: ## Lint and format-check the Python tooling with ruff
	$(RUFF) check tools/
	$(RUFF) format --check tools/

fmt: ## Reformat the Python tooling with ruff
	$(RUFF) format tools/
	$(RUFF) check --fix tools/

doctor: ## Report whether Quarto, PARI/GP and the engine are usable
	@./install.sh --check

check: doctor lint build ## Run every check: lint, syntax, tests and examples
	@$(PYTHON) -c "import xml.dom.minidom as m; m.parse('$(SYNTAX)')" \
	  && echo "$(SYNTAX): well-formed"
	@$(MAKE) --no-print-directory test
	@$(MAKE) --no-print-directory examples

package: build ## Build the release archives into dist/
	@rm -rf dist && mkdir -p dist
	@tar --transform 's,^,pari-gp/,' -czf \
	   dist/pari-gp-$(if $(V),$(V),$(VERSION)).tar.gz \
	   -C $(EXT_DIR) _extension.yml pari-gp.js pari-gp.xml
	@cd $(EXT_DIR) && zip -qr $(CURDIR)/dist/pari-gp-$(if $(V),$(V),$(VERSION)).zip \
	   _extension.yml pari-gp.js pari-gp.xml
	@ls -l dist

release-check: ## Check VERSION, _extension.yml and CHANGELOG agree: make release-check V=x.y.z
	@v="$(if $(V),$(V),$(VERSION))"; fail=0; \
	 got="$$(cat VERSION)"; \
	 [ "$$got" = "$$v" ] || { echo "VERSION is $$got, expected $$v" >&2; fail=1; }; \
	 got="$$(sed -n 's/^version: *//p' $(EXT_DIR)/_extension.yml)"; \
	 [ "$$got" = "$$v" ] || { echo "$(EXT_DIR)/_extension.yml is $$got, expected $$v" >&2; fail=1; }; \
	 got="$$(sed -n 's/^version: *//p' CITATION.cff)"; \
	 [ "$$got" = "$$v" ] || { echo "CITATION.cff is $$got, expected $$v" >&2; fail=1; }; \
	 grep -q "^## \[$$v\]" CHANGELOG.md || { echo "CHANGELOG.md has no section for $$v" >&2; fail=1; }; \
	 [ $$fail -eq 0 ] && echo "version $$v is consistent everywhere"; exit $$fail

tag: release-check ## Tag the current commit and push it, which triggers the release workflow
	@v="$(VERSION)"; \
	 git diff --quiet || { echo "working tree is dirty" >&2; exit 1; }; \
	 git tag -a "v$$v" -m "PARI-GP-ENGINE v$$v" && git push origin "v$$v" && \
	 echo "pushed v$$v — the release workflow takes it from here"

clean: ## Remove rendered documents and caches
	rm -rf .quarto _site docs/_site docs/.quarto
	rm -f  examples/*.html tests/cases/*.html tests/expect-fail/*.html
	rm -f  tests/cases/*.md
	rm -rf examples/*_files tests/cases/*_files tests/expect-fail/*_files docs/*_files
	rm -rf dist

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
