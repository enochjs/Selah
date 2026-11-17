Pod::Spec.new do |s|
  s.name = 'SelahAppUpdates'
  s.version = '1.0.0'
  s.summary = 'Installed app update metadata for Selah'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Selah'
  s.homepage = 'https://selah.app'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
