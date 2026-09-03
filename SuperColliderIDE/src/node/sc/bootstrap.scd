~n = NetAddr("127.0.0.1", ~port);

~classLookup = {|search|
	var classes;
	search = search.asString.toLower;
	classes = Class.allClasses.select({|x| x.name.asString.toLower.contains(search).and(x.name.asString.beginsWith("Meta_").not)}).collect({|x| x.name.asString});
	classes;
};

/*
~methodLookup = {|search, receiverClass, side|
	var classes;
	var methods;
	receiverClass = (receiverClass=="").if(nil, [receiverClass.asSymbol.asClass]);
	classes = receiverClass ? Class.allClasses;
	if(side=="class", {
		// class of class - so meta class for static classes
		classes = classes.collect({|x| x.class});
	});
	methods = classes.collect({|class| class.methods.select({|method|
		// asString seems expensive?
		(search=="").if(true, {method.name.asString.beginsWith(search)})
	})}).flatten.keep(100).select({|method| method.notNil}).collect({|method|
		"%\t%\t%".format(
			method.name,
			// do not propagate meta classes - use instance or class method symbol instead
			method.ownerClass.name.asString.replace("Meta_"),
			method.ownerClass.isMetaClass.if(\i, \c)
		)
	});
	methods;
};
*/

~methodLookup = {|search, receiverClass, meta|
	var classes = (receiverClass.isNil).if({
		Class.allClasses
	}, {
		var c = receiverClass.asSymbol.asClass;
		[c] ++ c.superclasses;
	});
	var methods = [];
	search = search.asSymbol;
	
	classes.do({|c|
		var base = c;
		meta.if({c = c.class});
		c.methods.select({|method|
			if(search == '', {true}, {method.name.isPrefix(search)})
		}).select({|method|
			// only add if it is not overwritten if receiver clas given
			receiverClass.isNil.if({
				true
			}, {
				methods.collect({|m| m.name}).includes(method.name).not;
			});
		}).do({|method|
			methods = methods.add((
				name: method.name,
				className: base.name,
				isClassMethod: c.isMetaClass,
				// argNames[0] is "this" - but could be nil, which returns 0
				// argCount: (method.argNames.size-1).max(0),
			))
		});
	});
	
	methods.keep(100).collect({|m|
		"%\t%\t%\t%".format(
			m.name,
			m.className,
			m.isClassMethod.if(\c, \i),
		)
	});
};

// this.query, ref.name,ref.ownerClass, ref.isClassMethod ? "class" : "instance"
~argsLookup = {|search, ownerClass, isClassMethod|
	var method;
	var arguments;
	// this should always be found...
	var class = ownerClass.asSymbol.asClass;
	// switch to meta class
	class = isClassMethod.if(class.class, class);
	
	method = class.findRespondingMethodFor(search.asSymbol);
	if(method.isNil, {[]}, {
		method.keyValuePairsFromArgs.clump(2).collect({|p|
			p[1].isNil.if({p[0].asString}, {"%=%".format(p[0], p[1].asCompileString)})
		})
	});
};

// provides env autocomplete lookup by returning the class of an env variable
~envClassLookup = {|name|
	var val = currentEnvironment[name];
	val.isNil.if([], { [val.class.name.asString] });
};

~theiaIDE = {|id, selector ... searchArgs|
	var reply = switch(selector)
		{\class} {~classLookup.(*searchArgs)}
		{\method} {~methodLookup.(
			searchArgs[0],
			(searchArgs[1].asString.size>0).if(searchArgs[1], nil),
			searchArgs[2] == "class"
		)}
		{\args} {~argsLookup.(
			searchArgs[0],
			searchArgs[1],
			searchArgs[2] == "class",
		)}
		{\envClass} {~envClassLookup.(searchArgs[0])};
	// reply could be empty on unknown lookup
	~n.sendMsg("/complete", id, *(reply ? []));
};
