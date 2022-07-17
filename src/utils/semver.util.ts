import { LoggerUtil } from './logger.util';
import semver from 'semver';

export type SemverUtilOptions = Readonly<{
    logger: LoggerUtil;
}>;

export class SemverUtil {
    private readonly logger: LoggerUtil;

    constructor(options: SemverUtilOptions) {
        this.logger = options.logger;
    }
    /**
     *
     * @param maybeValidVersionString
     * @returns
     */
    public isValid(maybeValidVersionString: string): string | null {
        const testStr = maybeValidVersionString.replace(/\^|~/g, '');

        let result: string | undefined | null = semver.clean(testStr, {
            loose: true
        });

        if (!result) {
            result = semver.coerce(testStr, {
                loose: true
            })?.version;

            if (!result) {
                return null;
            }
        }

        result = semver.valid(result);

        if (!result) {
            return null;
        }

        return result;
    }

    public validateSemverInput(
        theVersionToBeTested: string,
        theVersionToTestAgainst: string
    ) {
        const firstVersion = this.isValid(theVersionToBeTested);
        if (!firstVersion) {
            throw new Error(`${theVersionToBeTested} is not a valid version`);
        }

        const secondVersion = this.isValid(theVersionToTestAgainst);
        if (!secondVersion) {
            throw new Error(
                `${theVersionToTestAgainst} is not a valid version`
            );
        }

        return {
            firstVersion,
            secondVersion
        };
    }

    public isLessThan(
        theVersionToBeTested: string,
        theVersionToTestAgainst: string
    ): boolean {
        const { firstVersion, secondVersion } = this.validateSemverInput(
            theVersionToBeTested,
            theVersionToTestAgainst
        );
        return semver.lt(firstVersion, secondVersion);
    }

    public isLessThanOrEqualTo(
        theVersionToBeTested: string,
        theVersionToTestAgainst: string
    ): boolean {
        const { firstVersion, secondVersion } = this.validateSemverInput(
            theVersionToBeTested,
            theVersionToTestAgainst
        );
        return semver.lte(firstVersion, secondVersion);
    }

    public isGreaterThan(
        theVersionToBeTested: string,
        theVersionToTestAgainst: string
    ): boolean {
        const { firstVersion, secondVersion } = this.validateSemverInput(
            theVersionToBeTested,
            theVersionToTestAgainst
        );
        return semver.gt(firstVersion, secondVersion);
    }

    public isGreaterThanOrEqualTo(
        theVersionToBeTested: string,
        theVersionToTestAgainst: string
    ): boolean {
        const { firstVersion, secondVersion } = this.validateSemverInput(
            theVersionToBeTested,
            theVersionToTestAgainst
        );
        return semver.gte(firstVersion, secondVersion);
    }

    public isEqualTo(
        theVersionToBeTested: string,
        theVersionToTestAgainst: string
    ): boolean {
        const { firstVersion, secondVersion } = this.validateSemverInput(
            theVersionToBeTested,
            theVersionToTestAgainst
        );
        return semver.eq(firstVersion, secondVersion);
    }
}
