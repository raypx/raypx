# @raypx/provider-testing

Test-only provider host and controlled transport fixtures. Concrete adapters consume these
through devDependencies; runtime never imports this tooling workspace. Domain dependencies stop at
provider-core; shared suites use the declared Vite+ runner. Never import concrete adapters or applications. Keep transport and SDK fakes
at their external boundaries. Verify replaced handles cannot emit or approve work and
cancellation waits for transport/SDK drain.
